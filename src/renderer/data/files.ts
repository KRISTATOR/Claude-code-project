import { z } from 'zod';
import { extractText } from '@core/files/extract';
import { MAX_FILE_BYTES, mimeOf, sanitizeFileName, uniqueName } from '@core/files/names';
import { versionsToPrune } from '@core/files/retention';
import type { Scope } from '@core/files/tree';
import { fileKind, readData } from '@core/kinds';
import {
  fileLockRow,
  fileTextRow,
  fileVersionRow,
  type FileVersionRow,
  type RecordRow,
  type Visibility,
} from '@core/model';
import type { Cache } from './cache';
import { call, type Repo } from './repo';
import { RemoteError } from './remote';
import { sha256Hex, type StorageProvider } from './storage';
import type { Client } from './supabase';

export interface UploadInput {
  name: string;
  data: Uint8Array;
}

const commitResult = z.object({
  version_id: z.string(),
  no: z.number(),
  conflict: z.boolean(),
  replaced_path: z.string().nullable(),
});
export type CommitResult = z.infer<typeof commitResult>;

export class FileTooLargeError extends Error {
  constructor(
    readonly fileName: string,
    readonly size: number,
  ) {
    super(`file too large: ${fileName}`);
  }
}

export class LockedError extends Error {
  constructor(readonly holder: string) {
    super(`locked by ${holder}`);
  }
}

function scopeColumns(scope: Scope): { world_id: string | null; game_id: string | null } {
  if (scope.type === 'game') return { world_id: null, game_id: scope.id };
  if (scope.type === 'world') return { world_id: scope.id, game_id: null };
  return { world_id: null, game_id: null };
}

/**
 * The shared drive: uploads, versions, downloads through the local blob cache,
 * and Office check-out (docs/PLAN.md §2.6).
 */
export class FilesService {
  constructor(
    private readonly client: Client,
    private readonly cache: Cache,
    private readonly repo: Repo,
    private readonly teamId: string,
    private readonly storage: StorageProvider,
    private readonly extractPdfText: (data: Uint8Array) => Promise<string | null>,
  ) {}

  objectPath(fileId: string, versionId: string): string {
    return `${this.teamId}/${fileId}/${versionId}`;
  }

  private async siblingNames(
    scope: Scope,
    parentId: string | null,
    exceptId?: string,
  ): Promise<string[]> {
    const { world_id, game_id } = scopeColumns(scope);
    const rows = await this.cache.records.where('team_id').equals(this.teamId).toArray();
    return rows
      .filter(
        (row) =>
          (row.kind === 'file' || row.kind === 'folder') &&
          row.deleted_at === null &&
          row.id !== exceptId &&
          row.parent_id === parentId &&
          row.world_id === world_id &&
          row.game_id === game_id,
      )
      .map((row) => row.title);
  }

  async createFolder(
    scope: Scope,
    parentId: string | null,
    name: string,
    visibility: Visibility,
  ): Promise<RecordRow> {
    const title = uniqueName(sanitizeFileName(name), await this.siblingNames(scope, parentId));
    return this.repo.createRecord({
      kind: 'folder',
      title,
      parent_id: parentId,
      visibility,
      ...scopeColumns(scope),
    });
  }

  /** Creates a file record and its first version. */
  async uploadFile(
    scope: Scope,
    parentId: string | null,
    input: UploadInput,
    visibility: Visibility,
  ): Promise<RecordRow> {
    if (input.data.byteLength > MAX_FILE_BYTES)
      throw new FileTooLargeError(input.name, input.data.byteLength);
    const title = uniqueName(
      sanitizeFileName(input.name),
      await this.siblingNames(scope, parentId),
    );
    const mime = mimeOf(title);
    const record = await this.repo.createRecord({
      kind: 'file',
      title,
      parent_id: parentId,
      visibility,
      data: { mime, size: input.data.byteLength },
      ...scopeColumns(scope),
    });
    try {
      await this.storeVersion(record, input.data, { session: null, base: null });
    } catch (error) {
      // Do not leave an empty file behind.
      await call(this.client.from('records').delete().eq('id', record.id)).catch(() => undefined);
      await this.cache.records.delete(record.id);
      throw error;
    }
    return (await this.repo.refreshRecord(record.id)) ?? record;
  }

  /** Uploads bytes as a new object and records it as a version. */
  async storeVersion(
    record: RecordRow,
    data: Uint8Array,
    options: { session: string | null; base: string | null; label?: string },
  ): Promise<CommitResult> {
    if (data.byteLength > MAX_FILE_BYTES)
      throw new FileTooLargeError(record.title, data.byteLength);
    const sha = await sha256Hex(data);
    const mime = mimeOf(record.title);
    const versionId = crypto.randomUUID();
    await this.storage.upload(this.objectPath(record.id, versionId), data, mime);
    const raw = await call(
      this.client.rpc('commit_file_version', {
        p_file: record.id,
        p_version: versionId,
        p_size: data.byteLength,
        p_sha256: sha,
        p_mime: mime,
        p_session: options.session,
        p_base: options.base,
        p_label: options.label ?? '',
      }),
    );
    const result = commitResult.parse(raw);
    await window.zazemi.blobs.put(sha, data);
    if (result.replaced_path)
      await this.storage.remove([result.replaced_path]).catch(() => undefined);
    if (!result.conflict) await this.indexText(record, result.version_id, data);
    await this.repo.refreshRecord(record.id);
    return result;
  }

  /** Stores the searchable text of a version (best effort). */
  private async indexText(record: RecordRow, versionId: string, data: Uint8Array): Promise<void> {
    try {
      let text = extractText(record.title, data);
      if (text === null && record.title.toLowerCase().endsWith('.pdf'))
        text = await this.extractPdfText(data);
      if (text === null) return;
      const row = fileTextRow.parse(
        await call(
          this.client
            .from('file_text')
            .upsert({
              file_id: record.id,
              team_id: this.teamId,
              version_id: versionId,
              text: text.slice(0, 2_000_000),
            })
            .select()
            .single(),
        ),
      );
      await this.cache.fileText.put(row);
    } catch {
      // Search is a convenience; never fail an upload because of it.
    }
  }

  /** Bytes of the current (or a given) version, from the local cache if possible. */
  async getBytes(
    record: RecordRow,
    version?: Pick<FileVersionRow, 'sha256' | 'storage_path'>,
  ): Promise<{ data: Uint8Array; sha: string }> {
    const info = readData(fileKind, record);
    const sha = version?.sha256 ?? info.sha256;
    if (sha) {
      const cached = await window.zazemi.blobs.get(sha);
      if (cached) return { data: cached, sha };
    }
    const storagePath = version ? version.storage_path : await this.currentPath(record);
    const data = await this.storage.download(storagePath);
    const actual = await sha256Hex(data);
    await window.zazemi.blobs.put(actual, data);
    return { data, sha: actual };
  }

  /** The object path of the current version (its row may have been squashed). */
  private async currentPath(record: RecordRow): Promise<string> {
    const info = readData(fileKind, record);
    if (!info.current_version_id) throw new RemoteError('server', 'file has no content yet');
    const rows = z
      .array(fileVersionRow)
      .parse(
        await call(this.client.from('file_versions').select().eq('id', info.current_version_id)),
      );
    return rows[0]?.storage_path ?? this.objectPath(record.id, info.current_version_id);
  }

  async listVersions(fileId: string): Promise<FileVersionRow[]> {
    return z
      .array(fileVersionRow)
      .parse(
        await call(
          this.client
            .from('file_versions')
            .select()
            .eq('file_id', fileId)
            .order('no', { ascending: false }),
        ),
      );
  }

  async restoreVersion(record: RecordRow, version: FileVersionRow): Promise<CommitResult> {
    const { data } = await this.getBytes(record, version);
    const current = readData(fileKind, record).current_version_id;
    return this.storeVersion(record, data, {
      session: null,
      base: current,
      label: `obnoveno z verze ${version.no}`,
    });
  }

  async setPinned(version: FileVersionRow, pinned: boolean): Promise<void> {
    await call(this.client.from('file_versions').update({ pinned }).eq('id', version.id));
  }

  async setLabel(version: FileVersionRow, label: string): Promise<void> {
    await call(this.client.from('file_versions').update({ label }).eq('id', version.id));
  }

  async deleteVersion(version: FileVersionRow): Promise<void> {
    await call(this.client.from('file_versions').delete().eq('id', version.id));
    await this.storage.remove([version.storage_path]);
  }

  async rename(record: RecordRow, name: string): Promise<RecordRow> {
    const scope = { world_id: record.world_id, game_id: record.game_id };
    const parentScope: Scope = scope.game_id
      ? { type: 'game', id: scope.game_id }
      : scope.world_id
        ? { type: 'world', id: scope.world_id }
        : { type: 'team' };
    const title = uniqueName(
      sanitizeFileName(name),
      await this.siblingNames(parentScope, record.parent_id, record.id),
    );
    return this.repo.updateRecord(record.id, record.rev, { title });
  }

  async move(record: RecordRow, scope: Scope, parentId: string | null): Promise<RecordRow> {
    const title = uniqueName(record.title, await this.siblingNames(scope, parentId, record.id));
    return this.repo.updateRecord(record.id, record.rev, {
      title,
      parent_id: parentId,
      ...scopeColumns(scope),
    });
  }

  /** Permanently deletes a trashed file (all versions) or folder. */
  async deleteForever(record: RecordRow): Promise<void> {
    if (record.kind === 'file') {
      const versions = await this.listVersions(record.id);
      await this.storage.remove(versions.map((version) => version.storage_path));
    }
    await call(this.client.from('records').delete().eq('id', record.id));
    await this.cache.records.delete(record.id);
  }

  // --- Check-out --------------------------------------------------------

  async checkout(record: RecordRow, machine: string): Promise<string> {
    const response: { data: unknown; error: { message: string } | null } = await this.client.rpc(
      'checkout_file',
      { p_file: record.id, p_machine: machine },
    );
    const { data, error } = response;
    if (error) {
      const match = /locked by (.+)$/.exec(error.message);
      if (match?.[1]) throw new LockedError(match[1]);
      throw new RemoteError('server', error.message);
    }
    const sessionId = z.string().parse(data);
    // Show our own lock right away (others get it through sync).
    const locks = z
      .array(fileLockRow)
      .parse(await call(this.client.from('file_locks').select().eq('file_id', record.id)));
    if (locks[0]) await this.cache.locks.put(locks[0]);
    return sessionId;
  }

  async heartbeat(fileId: string, sessionId: string): Promise<boolean> {
    return z
      .boolean()
      .parse(
        await call(this.client.rpc('heartbeat_lock', { p_file: fileId, p_session: sessionId })),
      );
  }

  async release(fileId: string, sessionId: string): Promise<void> {
    await call(this.client.rpc('release_lock', { p_file: fileId, p_session: sessionId }));
    await this.cache.locks.delete(fileId);
  }

  async forceRelease(fileId: string): Promise<void> {
    await call(this.client.rpc('force_release_lock', { p_file: fileId }));
    await this.cache.locks.delete(fileId);
  }

  async keepSessionVersion(fileId: string, sessionId: string): Promise<void> {
    await call(this.client.rpc('keep_session_version', { p_file: fileId, p_session: sessionId }));
  }

  // --- Storage budget ----------------------------------------------------

  async usage(): Promise<number> {
    return Number(
      z
        .union([z.number(), z.string()])
        .parse(await call(this.client.rpc('storage_usage', { p_team: this.teamId }))),
    );
  }

  /** Applies the retention rule to every file of the team. Returns freed bytes. */
  async prune(now = new Date()): Promise<number> {
    const versions = z
      .array(fileVersionRow)
      .parse(await call(this.client.from('file_versions').select().eq('team_id', this.teamId)));
    const files = await this.cache.records
      .where('[team_id+kind]')
      .equals([this.teamId, 'file'])
      .toArray();
    const current = new Map(
      files.map((file) => [file.id, readData(fileKind, file).current_version_id]),
    );
    let freed = 0;
    const byFile = new Map<string, FileVersionRow[]>();
    for (const version of versions)
      byFile.set(version.file_id, [...(byFile.get(version.file_id) ?? []), version]);
    for (const [fileId, list] of byFile) {
      for (const id of versionsToPrune(list, current.get(fileId) ?? null, now)) {
        const version = list.find((item) => item.id === id);
        if (!version) continue;
        await this.deleteVersion(version);
        freed += version.size;
      }
    }
    return freed;
  }
}
