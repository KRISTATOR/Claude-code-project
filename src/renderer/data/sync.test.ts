import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Cache } from './cache';
import { RemoteError, type Remote, type SelectOptions, type SyncTable } from './remote';
import { RECONCILE_MS, SyncEngine } from './sync';

const me = randomUUID();
const teamId = randomUUID();
const personId = randomUUID();

/** A server that returns whatever rows are in `visible` for each table. */
class FakeRemote implements Remote {
  visible: Record<SyncTable, Record<string, unknown>[]> = {
    teams: [],
    people: [],
    team_members: [],
    invites: [],
    records: [],
    record_secrets: [],
    record_access: [],
    record_people: [],
    record_links: [],
    file_locks: [],
    file_text: [],
  };
  failWith: RemoteError | null = null;
  calls: { table: SyncTable; options?: SelectOptions }[] = [];

  selectAll(table: SyncTable, options?: SelectOptions): Promise<unknown[]> {
    this.calls.push(options ? { table, options } : { table });
    if (this.failWith) return Promise.reject(this.failWith);
    let rows = this.visible[table];
    const eq = options?.eq;
    if (eq) rows = rows.filter((row) => row[eq.column] === eq.value);
    const since = options?.since;
    if (since) rows = rows.filter((row) => String(row['updated_at']) >= since);
    const within = options?.in;
    if (within) rows = rows.filter((row) => within.values.includes(String(row[within.column])));
    if (options?.columns) {
      const columns = options.columns.split(',');
      rows = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
    }
    return Promise.resolve(rows.map((row) => ({ ...row })));
  }
}

function at(ms: number): string {
  return new Date(ms).toISOString();
}

function record(id: string, updatedMs: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    team_id: teamId,
    kind: 'world',
    world_id: null,
    game_id: null,
    parent_id: null,
    title: `Svět ${id.slice(0, 4)}`,
    data: {},
    visibility: 'everyone',
    inherit_audience: false,
    sort_key: '',
    tags: [],
    rev: 1,
    created_by: me,
    created_at: at(0),
    updated_by: me,
    updated_at: at(updatedMs),
    deleted_by: null,
    deleted_at: null,
    ...extra,
  };
}

let clock = 1_000_000_000_000;
let cache: Cache;
let remote: FakeRemote;
let engine: SyncEngine;

beforeEach(() => {
  clock = 1_800_000_000_000;
  cache = new Cache(`test-${randomUUID()}`);
  remote = new FakeRemote();
  remote.visible.teams = [
    {
      id: teamId,
      name: 'Spolek',
      settings: {},
      min_app_version: '0.0.0',
      created_at: at(0),
      updated_at: at(0),
    },
  ];
  remote.visible.team_members = [
    {
      team_id: teamId,
      user_id: me,
      person_id: personId,
      role: 'player',
      joined_at: at(0),
      updated_at: at(0),
    },
  ];
  remote.visible.people = [
    {
      id: personId,
      team_id: teamId,
      display_name: 'Hana',
      user_id: me,
      created_at: at(0),
      updated_at: at(0),
      deleted_at: null,
    },
  ];
  engine = new SyncEngine(cache, remote, me, () => clock);
});

afterEach(async () => {
  await cache.delete();
});

describe('SyncEngine', () => {
  it('fills the cache on first sync', async () => {
    const a = randomUUID();
    remote.visible.records = [record(a, clock - 1000)];
    await engine.sync(teamId);
    expect(await cache.teams.count()).toBe(1);
    expect(await cache.records.get(a)).toMatchObject({ title: `Svět ${a.slice(0, 4)}` });
    expect(engine.getStatus().state).toBe('idle');
    expect(engine.getStatus().lastSyncAt).toBe(at(clock));
  });

  it('asks only for recent changes after the first sync, with an overlap', async () => {
    const a = randomUUID();
    remote.visible.records = [record(a, clock - 1000)];
    await engine.sync(teamId);
    remote.calls = [];
    clock += 60_000;
    await engine.sync(teamId);
    const recordCall = remote.calls.find(
      (call) => call.table === 'records' && !call.options?.columns,
    );
    expect(recordCall?.options?.since).toBe(at(clock - 60_000 - 1000 - 2 * 60 * 1000));
  });

  it('picks up edits', async () => {
    const a = randomUUID();
    remote.visible.records = [record(a, clock - 1000)];
    await engine.sync(teamId);
    remote.visible.records = [record(a, clock + 5000, { title: 'Přejmenováno', rev: 2 })];
    clock += 10_000;
    await engine.sync(teamId);
    expect((await cache.records.get(a))?.title).toBe('Přejmenováno');
  });

  it('deletes records that became hidden once it reconciles', async () => {
    const a = randomUUID();
    const b = randomUUID();
    remote.visible.records = [record(a, clock - 1000), record(b, clock - 1000)];
    await engine.sync(teamId);
    // The organizer hides `b`: RLS simply stops returning it.
    remote.visible.records = [record(a, clock - 1000)];
    clock += 1000;
    await engine.sync(teamId);
    expect(await cache.records.get(b)).toBeDefined();
    clock += RECONCILE_MS;
    await engine.sync(teamId);
    expect(await cache.records.get(b)).toBeUndefined();
    expect(await cache.records.get(a)).toBeDefined();
  });

  it('can be forced to reconcile immediately', async () => {
    const b = randomUUID();
    remote.visible.records = [record(b, clock - 1000)];
    await engine.sync(teamId);
    remote.visible.records = [];
    await engine.sync(teamId, { reconcile: true });
    expect(await cache.records.count()).toBe(0);
  });

  it('never stores secrets for non-organizers', async () => {
    remote.visible.record_secrets = [
      {
        record_id: randomUUID(),
        team_id: teamId,
        data: { x: 1 },
        rev: 1,
        updated_by: me,
        updated_at: at(clock),
      },
    ];
    await engine.sync(teamId);
    expect(await cache.secrets.count()).toBe(0);
    expect(remote.calls.some((call) => call.table === 'record_secrets')).toBe(false);
  });

  it('stores secrets for organizers', async () => {
    remote.visible.team_members = [
      {
        team_id: teamId,
        user_id: me,
        person_id: personId,
        role: 'organizer',
        joined_at: at(0),
        updated_at: at(0),
      },
    ];
    const id = randomUUID();
    remote.visible.record_secrets = [
      {
        record_id: id,
        team_id: teamId,
        data: { truth: 'x' },
        rev: 1,
        updated_by: me,
        updated_at: at(clock),
      },
    ];
    await engine.sync(teamId);
    expect((await cache.secrets.get(id))?.data).toEqual({ truth: 'x' });
  });

  it('removes everything of a team the user no longer belongs to', async () => {
    remote.visible.records = [record(randomUUID(), clock - 1000)];
    await engine.sync(teamId);
    expect(await cache.records.count()).toBe(1);
    remote.visible.team_members = [];
    remote.visible.teams = [];
    await engine.sync(teamId);
    expect(await cache.records.count()).toBe(0);
    expect(await cache.teams.count()).toBe(0);
    expect(await cache.people.count()).toBe(0);
  });

  it('keeps the cache and reports offline when the network is down', async () => {
    remote.visible.records = [record(randomUUID(), clock - 1000)];
    await engine.sync(teamId);
    remote.failWith = new RemoteError('offline', 'Failed to fetch');
    await engine.sync(teamId);
    expect(engine.getStatus().state).toBe('offline');
    expect(await cache.records.count()).toBe(1);
  });

  it('reports a paused project', async () => {
    remote.failWith = new RemoteError('paused', 'Project paused');
    await engine.sync(teamId);
    expect(engine.getStatus().state).toBe('paused');
  });

  it('replaces small tables, so removed rows disappear', async () => {
    const extra = randomUUID();
    remote.visible.people.push({
      id: extra,
      team_id: teamId,
      display_name: 'Bára',
      user_id: null,
      created_at: at(0),
      updated_at: at(0),
      deleted_at: null,
    });
    await engine.sync(teamId);
    expect(await cache.people.get(extra)).toBeDefined();
    remote.visible.people = remote.visible.people.filter((row) => row['id'] !== extra);
    await engine.sync(teamId);
    expect(await cache.people.get(extra)).toBeUndefined();
  });

  it('a sync requested during another one uses the newest team', async () => {
    remote.visible.records = [record(randomUUID(), clock - 1000)];
    const first = engine.sync(null);
    const second = engine.sync(teamId);
    await Promise.all([first, second]);
    expect(await cache.records.count()).toBe(1);
    expect(await cache.people.count()).toBe(1);
  });

  it('fetches an old record as soon as the player is attached to it', async () => {
    const world = record(randomUUID(), clock - 1000);
    remote.visible.records = [world];
    await engine.sync(teamId);
    const character = randomUUID();
    // Edited long ago, before the last cursor; attaching does not touch it.
    remote.visible.records = [world, record(character, 1000, { kind: 'character' })];
    remote.visible.record_people = [
      {
        record_id: character,
        person_id: personId,
        team_id: teamId,
        relation: 'player',
        updated_at: at(clock),
      },
    ];
    clock += 1000;
    await engine.sync(teamId);
    expect(await cache.records.get(character)).toBeDefined();
  });

  it('keeps file locks and file text in step with the server', async () => {
    const file = randomUUID();
    const lock = {
      file_id: file,
      team_id: teamId,
      user_id: me,
      display_name: 'Kvido',
      machine: 'NOTEBOOK',
      session_id: randomUUID(),
      acquired_at: at(clock),
      heartbeat_at: at(clock),
      updated_at: at(clock),
    };
    remote.visible.file_locks = [lock];
    remote.visible.file_text = [
      { file_id: file, team_id: teamId, version_id: null, text: 'Lipnov', updated_at: at(clock) },
    ];
    await engine.sync(teamId);
    expect(await cache.locks.get(file)).toMatchObject({ display_name: 'Kvido' });
    expect((await cache.fileText.get(file))?.text).toBe('Lipnov');

    remote.visible.file_locks = [];
    remote.visible.file_text = [];
    await engine.sync(teamId, { reconcile: true });
    expect(await cache.locks.count()).toBe(0);
    expect(await cache.fileText.count()).toBe(0);
  });
});
