import { z } from 'zod';
import { backupFile, planRestore, type BackupFile, type RestorePlan } from '@core/restore';
import { recordRow } from '@core/model';
import { call } from './call';
import type { FilesService } from './files';
import { SupabaseRemote } from './supabase-remote';
import type { Client } from './supabase';

/** An opened backup archive: its parsed zazemi.json and a reader for its files. */
export interface OpenedBackup {
  backup: BackupFile;
  read: (entry: string) => Promise<Uint8Array | null>;
  close: () => void;
}

export class NotABackupError extends Error {
  constructor() {
    super('not a Zázemí backup');
    this.name = 'NotABackupError';
  }
}

/** Asks main for a .zip and reads its zazemi.json. `null` when the user cancels. */
export async function openBackup(): Promise<OpenedBackup | null> {
  const listing = await window.zazemi.archives.open();
  if (!listing) return null;
  if (listing.error || !listing.archives[0]) throw new NotABackupError();
  const token = listing.token;
  const entries = listing.archives[0].entries;
  const close = () => void window.zazemi.archives.close(token);
  const indexOf = (path: string) => entries.findIndex((entry) => entry.path === path);
  const read = async (path: string) => {
    const index = indexOf(path);
    return index < 0 ? null : window.zazemi.archives.read(token, 0, index);
  };
  const json = await read('zazemi.json');
  const parsed = json
    ? backupFile.safeParse(JSON.parse(new TextDecoder().decode(json)) as unknown)
    : null;
  if (!parsed?.success) {
    close();
    throw new NotABackupError();
  }
  return { backup: parsed.data, read, close };
}

/** What the server has now, to decide what is missing. */
export async function restorePlanFor(
  client: Client,
  teamId: string,
  backup: BackupFile,
): Promise<RestorePlan> {
  const remote = new SupabaseRemote(client);
  const eq = { column: 'team_id', value: teamId };
  const ids = z.array(z.object({ id: z.string() }));
  const records = ids.parse(await remote.selectAll('records', { eq, columns: 'id' }));
  const registrations = ids.parse(await remote.selectAll('registrations', { eq, columns: 'id' }));
  const people = z
    .array(z.object({ id: z.string(), display_name: z.string() }))
    .parse(await remote.selectAll('people', { eq, columns: 'id,display_name' }));
  return planRestore(backup, {
    teamId,
    recordIds: new Set(records.map((row) => row.id)),
    registrationIds: new Set(registrations.map((row) => row.id)),
    people,
    newId: () => crypto.randomUUID(),
  });
}

export interface RestoreResult {
  records: number;
  files: number;
  failedFiles: string[];
}

const BATCH = 50;

function batches<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) out.push(rows.slice(i, i + BATCH));
  return out;
}

/** Writes a restore plan to the server (organizers only, through RLS). */
export async function runRestore(
  plan: RestorePlan,
  context: {
    client: Client;
    files: FilesService;
    teamId: string;
    read: (entry: string) => Promise<Uint8Array | null>;
    onProgress: (done: number, total: number) => void;
  },
): Promise<RestoreResult> {
  const { client, teamId } = context;
  const team = { team_id: teamId };
  const total = plan.records.length + plan.files.length;
  let done = 0;
  const insert = async (table: string, rows: Record<string, unknown>[]) => {
    for (const batch of batches(rows)) {
      await call(client.from(table).insert(batch.map((row) => ({ ...row, ...team }))));
    }
  };

  await insert('people', plan.people);
  for (const batch of batches(plan.records)) {
    await call(client.from('records').insert(batch.map((row) => ({ ...row, ...team }))));
    done += batch.length;
    context.onProgress(done, total);
  }
  await insert('record_secrets', plan.secrets);
  await insert('record_access', plan.access);
  await insert('record_people', plan.recordPeople);
  await insert('registrations', plan.registrations);

  const failedFiles: string[] = [];
  let files = 0;
  for (const item of plan.files) {
    done += 1;
    context.onProgress(done, total);
    const record = plan.records.find((row) => row.id === item.recordId);
    try {
      const data = await context.read(item.entry);
      if (!data) throw new Error('missing in backup');
      const fresh = recordRow.parse(
        await call(client.from('records').select().eq('id', item.recordId).single()),
      );
      await context.files.storeVersion(fresh, data, { session: null, base: null });
      files += 1;
    } catch {
      failedFiles.push(record?.title ?? item.recordId);
    }
  }
  return { records: plan.records.length, files, failedFiles };
}
