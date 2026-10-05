import { z } from 'zod';
import {
  fileLockRow,
  fileTextRow,
  inviteRow,
  memberRow,
  personRow,
  recordAccessRow,
  recordLinkRow,
  recordPersonRow,
  recordRow,
  recordSecretRow,
  registrationRow,
  teamRow,
  type MemberRole,
} from '@core/model';
import type { Cache } from './cache';
import { classifyError, type Remote } from './remote';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'paused' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  message: string | null;
}

/** Re-read a little before the last cursor: transactions can commit out of order. */
export const OVERLAP_MS = 2 * 60 * 1000;
/** How often to re-check which rows are still visible (revocation). */
export const RECONCILE_MS = 10 * 60 * 1000;
/** Ids per request when fetching rows that became visible (URL length). */
const FETCH_CHUNK = 100;

const PAGE_TABLES = {
  people: personRow,
  team_members: memberRow,
  invites: inviteRow,
  record_access: recordAccessRow,
  record_people: recordPersonRow,
  record_links: recordLinkRow,
  file_locks: fileLockRow,
  registrations: registrationRow,
} as const;

type Listener = () => void;

/**
 * Keeps the local cache equal to what the server lets this user read
 * (docs/PLAN.md §2.3). Small tables are replaced on every sync; records and
 * secrets are pulled incrementally and reconciled by id periodically, so rows
 * that became invisible are deleted locally.
 */
export class SyncEngine {
  private status: SyncStatus = { state: 'idle', lastSyncAt: null, message: null };
  private listeners = new Set<Listener>();
  private running: Promise<void> | null = null;
  private queued: { teamId: string | null; reconcile: boolean } | null = null;

  constructor(
    private readonly cache: Cache,
    private readonly remote: Remote,
    private readonly userId: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  getStatus = (): SyncStatus => this.status;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setStatus(next: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...next };
    for (const listener of this.listeners) listener();
  }

  async loadLastSync(): Promise<void> {
    const last = await this.cache.getMeta<string>('lastSyncAt');
    if (last) this.setStatus({ lastSyncAt: last });
  }

  /**
   * Runs a sync. Calls made while one is running coalesce into a single
   * follow-up run that uses the most recent team and the union of options.
   */
  sync(teamId: string | null, options: { reconcile?: boolean } = {}): Promise<void> {
    this.queued = {
      teamId,
      reconcile: (this.queued?.reconcile ?? false) || (options.reconcile ?? false),
    };
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        for (let next = this.takeQueued(); next; next = this.takeQueued()) {
          await this.runOnce(next.teamId, next.reconcile);
        }
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private takeQueued(): { teamId: string | null; reconcile: boolean } | null {
    const next = this.queued;
    this.queued = null;
    return next;
  }

  private async runOnce(teamId: string | null, forceReconcile: boolean): Promise<void> {
    this.setStatus({ state: 'syncing', message: null });
    try {
      const teamIds = await this.syncMemberships();
      if (teamId && teamIds.includes(teamId)) await this.syncTeam(teamId, forceReconcile);
      const at = new Date(this.now()).toISOString();
      await this.cache.setMeta('lastSyncAt', at);
      this.setStatus({ state: 'idle', lastSyncAt: at });
    } catch (error) {
      const classified = classifyError(error);
      this.setStatus({
        state:
          classified.kind === 'offline'
            ? 'offline'
            : classified.kind === 'paused'
              ? 'paused'
              : 'error',
        message: classified.message,
      });
    }
  }

  /** The teams I belong to. Data of teams I left is removed from this computer. */
  private async syncMemberships(): Promise<string[]> {
    const mine = z.array(memberRow).parse(
      await this.remote.selectAll('team_members', {
        eq: { column: 'user_id', value: this.userId },
      }),
    );
    const teams = z.array(teamRow).parse(await this.remote.selectAll('teams'));
    const teamIds = mine.map((row) => row.team_id);
    const known = (await this.cache.teams.toArray()).map((team) => team.id);
    for (const gone of known.filter((id) => !teamIds.includes(id))) await this.dropTeam(gone);
    await this.cache.transaction('rw', [this.cache.teams, this.cache.members], async () => {
      await this.cache.teams.bulkPut(teams.filter((team) => teamIds.includes(team.id)));
      await this.cache.members.bulkPut(mine);
    });
    return teamIds;
  }

  private async syncTeam(teamId: string, forceReconcile: boolean): Promise<void> {
    const eq = { column: 'team_id', value: teamId };
    const fetched = await Promise.all(
      (Object.keys(PAGE_TABLES) as (keyof typeof PAGE_TABLES)[]).map(async (table) => ({
        table,
        rows: await this.remote.selectAll(table, { eq }),
      })),
    );
    const parsed = Object.fromEntries(
      fetched.map(({ table, rows }) => [
        table,
        z.array(PAGE_TABLES[table] as z.ZodType).parse(rows),
      ]),
    ) as {
      [K in keyof typeof PAGE_TABLES]: z.infer<(typeof PAGE_TABLES)[K]>[];
    };

    const myRole: MemberRole | undefined = parsed.team_members.find(
      (m) => m.user_id === this.userId,
    )?.role;
    const c = this.cache;
    await c.transaction(
      'rw',
      [
        c.people,
        c.members,
        c.invites,
        c.access,
        c.recordPeople,
        c.links,
        c.locks,
        c.registrations,
      ],
      async () => {
        await c.people.where('team_id').equals(teamId).delete();
        await c.people.bulkPut(parsed.people);
        await c.members.where('team_id').equals(teamId).delete();
        await c.members.bulkPut(parsed.team_members);
        await c.invites.where('team_id').equals(teamId).delete();
        await c.invites.bulkPut(parsed.invites);
        await c.access.where('team_id').equals(teamId).delete();
        await c.access.bulkPut(parsed.record_access);
        await c.recordPeople.where('team_id').equals(teamId).delete();
        await c.recordPeople.bulkPut(parsed.record_people);
        await c.links.where('team_id').equals(teamId).delete();
        await c.links.bulkPut(parsed.record_links);
        await c.locks.where('team_id').equals(teamId).delete();
        await c.locks.bulkPut(parsed.file_locks);
        // Replaced whole, so hard-deleted registrations disappear on the next sync.
        await c.registrations.where('team_id').equals(teamId).delete();
        await c.registrations.bulkPut(parsed.registrations);
      },
    );

    await this.pullRecords(teamId);
    await this.pullFileText(teamId);
    if (myRole === 'organizer') await this.pullSecrets(teamId);
    else await c.secrets.where('team_id').equals(teamId).delete();

    // Attaching someone or changing an access list does not touch the record
    // itself, so incremental pulls miss it; a changed audience forces a
    // reconcile, which fetches records that became visible.
    const audience = JSON.stringify([
      myRole,
      parsed.record_people.map((row) => `${row.record_id}:${row.person_id}:${row.relation}`).sort(),
      parsed.record_access
        .map((row) => `${row.record_id}:${row.person_id ?? ''}:${row.member_role ?? ''}`)
        .sort(),
    ]);
    const audienceChanged = (await c.getMeta<string>(`audience:${teamId}`)) !== audience;
    const reconciledAt = (await c.getMeta<number>(`reconciledAt:${teamId}`)) ?? 0;
    if (forceReconcile || audienceChanged || this.now() - reconciledAt >= RECONCILE_MS) {
      await this.reconcile(teamId, myRole === 'organizer');
      await c.setMeta(`reconciledAt:${teamId}`, this.now());
      await c.setMeta(`audience:${teamId}`, audience);
    }
  }

  private since(cursor: string | undefined): string | undefined {
    if (!cursor) return undefined;
    return new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString();
  }

  private async pullRecords(teamId: string): Promise<void> {
    const key = `cursor:records:${teamId}`;
    const cursor = await this.cache.getMeta<string>(key);
    const since = this.since(cursor);
    const rows = z.array(recordRow).parse(
      await this.remote.selectAll('records', {
        eq: { column: 'team_id', value: teamId },
        ...(since ? { since } : {}),
      }),
    );
    if (rows.length === 0) return;
    await this.cache.records.bulkPut(rows);
    await this.cache.setMeta(
      key,
      maxTimestamp(
        rows.map((row) => row.updated_at),
        cursor,
      ),
    );
  }

  private async pullSecrets(teamId: string): Promise<void> {
    const key = `cursor:secrets:${teamId}`;
    const cursor = await this.cache.getMeta<string>(key);
    const since = this.since(cursor);
    const rows = z.array(recordSecretRow).parse(
      await this.remote.selectAll('record_secrets', {
        eq: { column: 'team_id', value: teamId },
        ...(since ? { since } : {}),
      }),
    );
    if (rows.length === 0) return;
    await this.cache.secrets.bulkPut(rows);
    await this.cache.setMeta(
      key,
      maxTimestamp(
        rows.map((row) => row.updated_at),
        cursor,
      ),
    );
  }

  private async pullFileText(teamId: string): Promise<void> {
    const key = `cursor:fileText:${teamId}`;
    const cursor = await this.cache.getMeta<string>(key);
    const since = this.since(cursor);
    const rows = z.array(fileTextRow).parse(
      await this.remote.selectAll('file_text', {
        eq: { column: 'team_id', value: teamId },
        ...(since ? { since } : {}),
      }),
    );
    if (rows.length === 0) return;
    await this.cache.fileText.bulkPut(rows);
    await this.cache.setMeta(
      key,
      maxTimestamp(
        rows.map((row) => row.updated_at),
        cursor,
      ),
    );
  }

  /** Deletes local rows the server no longer returns (deleted or hidden). */
  private async reconcile(teamId: string, organizer: boolean): Promise<void> {
    const eq = { column: 'team_id', value: teamId };
    const idRows = z
      .array(z.object({ id: z.string() }))
      .parse(await this.remote.selectAll('records', { eq, columns: 'id' }));
    const visible = new Set(idRows.map((row) => row.id));
    const localIds = await this.cache.records.where('team_id').equals(teamId).primaryKeys();
    await this.cache.records.bulkDelete(localIds.filter((id) => !visible.has(id)));
    const local = new Set(localIds);
    const missing = [...visible].filter((id) => !local.has(id));
    for (const ids of chunks(missing, FETCH_CHUNK)) {
      const rows = z
        .array(recordRow)
        .parse(await this.remote.selectAll('records', { eq, in: { column: 'id', values: ids } }));
      await this.cache.records.bulkPut(rows);
    }

    const textRows = z
      .array(z.object({ file_id: z.string() }))
      .parse(await this.remote.selectAll('file_text', { eq, columns: 'file_id' }));
    const visibleText = new Set(textRows.map((row) => row.file_id));
    const localText = await this.cache.fileText.where('team_id').equals(teamId).primaryKeys();
    await this.cache.fileText.bulkDelete(localText.filter((id) => !visibleText.has(id)));
    const localTextSet = new Set(localText);
    const missingText = [...visibleText].filter((id) => !localTextSet.has(id));
    for (const ids of chunks(missingText, FETCH_CHUNK)) {
      const rows = z.array(fileTextRow).parse(
        await this.remote.selectAll('file_text', {
          eq,
          in: { column: 'file_id', values: ids },
        }),
      );
      await this.cache.fileText.bulkPut(rows);
    }

    if (organizer) {
      const secretRows = z
        .array(z.object({ record_id: z.string() }))
        .parse(await this.remote.selectAll('record_secrets', { eq, columns: 'record_id' }));
      const visibleSecrets = new Set(secretRows.map((row) => row.record_id));
      const localSecretIds = await this.cache.secrets.where('team_id').equals(teamId).primaryKeys();
      await this.cache.secrets.bulkDelete(localSecretIds.filter((id) => !visibleSecrets.has(id)));
    }
  }

  private async dropTeam(teamId: string): Promise<void> {
    const c = this.cache;
    await c.transaction(
      'rw',
      [
        c.teams,
        c.people,
        c.members,
        c.invites,
        c.records,
        c.secrets,
        c.access,
        c.recordPeople,
        c.links,
        c.locks,
        c.fileText,
        c.registrations,
      ],
      async () => {
        await c.teams.delete(teamId);
        for (const table of [
          c.people,
          c.members,
          c.invites,
          c.records,
          c.secrets,
          c.access,
          c.recordPeople,
          c.links,
          c.locks,
          c.fileText,
          c.registrations,
        ]) {
          await table.where('team_id').equals(teamId).delete();
        }
      },
    );
    await c.meta.bulkDelete([
      `cursor:records:${teamId}`,
      `cursor:secrets:${teamId}`,
      `cursor:fileText:${teamId}`,
      `reconciledAt:${teamId}`,
    ]);
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function maxTimestamp(values: string[], current: string | undefined): string {
  let best = current;
  let bestMs = current ? new Date(current).getTime() : -Infinity;
  for (const value of values) {
    const ms = new Date(value).getTime();
    if (ms > bestMs) {
      best = value;
      bestMs = ms;
    }
  }
  return best ?? new Date(0).toISOString();
}
