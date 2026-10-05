import Dexie, { type Table } from 'dexie';
import type {
  FileLockRow,
  FileTextRow,
  InviteRow,
  MemberRow,
  PersonRow,
  RecordAccessRow,
  RecordLinkRow,
  RecordPersonRow,
  RecordRow,
  RecordSecretRow,
  TeamRow,
} from '@core/model';

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * The local copy of everything this user may read (docs/PLAN.md §2.3). One
 * database per account, so a shared laptop never mixes people's data.
 */
export class Cache extends Dexie {
  teams!: Table<TeamRow, string>;
  people!: Table<PersonRow, string>;
  members!: Table<MemberRow, [string, string]>;
  invites!: Table<InviteRow, string>;
  records!: Table<RecordRow, string>;
  secrets!: Table<RecordSecretRow, string>;
  access!: Table<RecordAccessRow, string>;
  recordPeople!: Table<RecordPersonRow, [string, string, string]>;
  links!: Table<RecordLinkRow, [string, string, string]>;
  meta!: Table<MetaRow, string>;
  locks!: Table<FileLockRow, string>;
  fileText!: Table<FileTextRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      teams: 'id',
      people: 'id, team_id, user_id',
      members: '[team_id+user_id], team_id, user_id, person_id',
      invites: 'id, team_id',
      records: 'id, team_id, kind, game_id, world_id, parent_id, updated_at, [team_id+kind]',
      secrets: 'record_id, team_id',
      access: 'id, record_id, team_id',
      recordPeople: '[record_id+person_id+relation], record_id, person_id, team_id',
      links: '[from_id+to_id+kind], from_id, to_id, team_id',
      meta: 'key',
    });
    // M1b: file locks and extracted file text for search.
    this.version(2).stores({
      locks: 'file_id, team_id',
      fileText: 'file_id, team_id, updated_at',
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }
}

export function cacheName(userId: string): string {
  return `zazemi-${userId}`;
}

export function openCache(userId: string): Cache {
  return new Cache(cacheName(userId));
}

/** "Sign out and delete data from this computer". */
export async function deleteCache(userId: string): Promise<void> {
  await Dexie.delete(cacheName(userId));
}
