import { readData, fileKind } from '@core/kinds';
import { childrenOf, type Scope } from '@core/files/tree';
import {
  planImport,
  withoutCopyNumber,
  type ImportPlan,
  type ImportReport,
  type ImportSource,
} from '@core/files/takeout';
import type { RecordRow } from '@core/model';
import type { FilesService } from '../data/files';
import { sha256Hex } from '../data/storage';
import type { PickedFile } from './dropped';

/** Something to import: where it goes and how to read it. */
export interface ImportJob {
  plan: ImportPlan;
  read: (ref: string) => Promise<Uint8Array>;
}

/** Files picked or dropped from the computer. */
export function jobFromPicked(picked: PickedFile[]): ImportJob {
  const sources: ImportSource[] = picked.map(({ folders, file }, index) => ({
    path: [...folders, file.name].join('/'),
    size: file.size,
    ref: String(index),
  }));
  return {
    plan: planImport(sources),
    read: async (ref) => {
      const item = picked[Number(ref)];
      if (!item) throw new Error('missing file');
      return new Uint8Array(await item.file.arrayBuffer());
    },
  };
}

/** Zip archives opened in main (Drive downloads, Takeout parts). */
export function jobFromArchives(
  token: string,
  archives: { entries: { path: string; size: number }[] }[],
): ImportJob {
  const sources: ImportSource[] = archives.flatMap((archive, a) =>
    archive.entries.map((entry, e) => ({
      path: entry.path,
      size: entry.size,
      ref: `${String(a)}:${String(e)}`,
    })),
  );
  return {
    plan: planImport(sources),
    read: (ref) => {
      const [a, e] = ref.split(':').map(Number);
      return window.zazemi.archives.read(token, a ?? 0, e ?? 0);
    },
  };
}

export interface ImportContext {
  files: FilesService;
  scope: Scope;
  folderId: string | null;
  /** The drive's current files and folders (fresh from the cache). */
  items: () => Promise<RecordRow[]>;
  /** New items take the visibility of their folder. */
  inheritVisibility: (parentId: string | null, created: RecordRow) => Promise<void>;
  onProgress: (done: number, total: number, name: string) => void;
  describeError: (error: unknown) => string;
}

/**
 * Uploads a plan into the drive, recreating its folders and reusing ones
 * that exist. Files already there with the same name and size are skipped,
 * so an interrupted import can simply be run again; a Google "(1)" copy with
 * the same content as its original is skipped as a duplicate.
 */
export async function runImport(job: ImportJob, context: ImportContext): Promise<ImportReport> {
  const report: ImportReport = { imported: [], skipped: [...job.plan.skipped], failed: [] };
  const folderIds = new Map<string, string | null>([['', context.folderId]]);
  const contents = new Map<string, string>();
  const total = job.plan.files.length;
  let done = 0;
  for (const file of job.plan.files) {
    context.onProgress(done, total, file.name);
    done += 1;
    try {
      let parent: string | null = context.folderId;
      for (let depth = 1; depth <= file.folders.length; depth += 1) {
        const key = file.folders.slice(0, depth).join('/');
        const known = folderIds.get(key);
        if (known !== undefined) {
          parent = known;
          continue;
        }
        const name = file.folders[depth - 1] ?? '';
        const existing = childrenOf(await context.items(), context.scope, parent).find(
          (item) =>
            item.kind === 'folder' &&
            item.title.toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs'),
        );
        const created =
          existing ?? (await context.files.createFolder(context.scope, parent, name, 'organizers'));
        if (!existing) await context.inheritVisibility(parent, created);
        folderIds.set(key, created.id);
        parent = created.id;
      }
      const siblings = childrenOf(await context.items(), context.scope, parent);
      if (
        siblings.some(
          (item) =>
            item.kind === 'file' &&
            item.title.toLocaleLowerCase('cs') === file.name.toLocaleLowerCase('cs') &&
            readData(fileKind, item).size === file.size,
        )
      ) {
        report.skipped.push({ path: file.path, reason: 'existing' });
        continue;
      }
      const data = await job.read(file.ref);
      const sha = await sha256Hex(data);
      const original = withoutCopyNumber(file.name).toLocaleLowerCase('cs');
      const contentKey = `${file.folders.join('/')}/${original}:${sha}`;
      const sameAsOriginal = siblings.some(
        (item) =>
          item.kind === 'file' &&
          item.title.toLocaleLowerCase('cs') === original &&
          readData(fileKind, item).sha256 === sha,
      );
      if (
        contents.has(contentKey) ||
        (original !== file.name.toLocaleLowerCase('cs') && sameAsOriginal)
      ) {
        report.skipped.push({ path: file.path, reason: 'duplicate' });
        continue;
      }
      contents.set(contentKey, file.path);
      const record = await context.files.uploadFile(
        context.scope,
        parent,
        { name: file.name, data },
        'organizers',
      );
      await context.inheritVisibility(parent, record);
      report.imported.push(file.path);
    } catch (error) {
      report.failed.push({ path: file.path, message: context.describeError(error) });
    }
  }
  return report;
}
