import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RecordRow } from '@core/model';
import { Cache } from './cache';
import { CONFLICT, Outbox, type OutboxServer, type QueuedRecord } from './outbox';

type Reply = { data: unknown; error: { message: string; code?: string } | null; status: number };

/** A server with an in-memory records table; rpc() answers with whatever `reply` says. */
class FakeServer implements OutboxServer {
  calls: { fn: string; args: unknown }[] = [];
  records = new Map<string, RecordRow>();
  offline = false;
  reply: (fn: string) => Reply | Error = () => ({ data: null, error: null, status: 204 });

  private check() {
    if (this.offline) throw new TypeError('Failed to fetch');
  }

  rpc(fn: string, args: Record<string, unknown>): Promise<Reply> {
    this.calls.push({ fn, args });
    const reply = this.offline ? new TypeError('Failed to fetch') : this.reply(fn);
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  }

  fetchRecord(id: string): Promise<RecordRow> {
    this.check();
    const row = this.records.get(id);
    return row ? Promise.resolve(row) : Promise.reject(new Error('missing'));
  }

  insertRecord(row: Record<string, unknown>): Promise<RecordRow> {
    this.check();
    const stored = { ...(row as unknown as RecordRow), rev: 1 };
    this.records.set(stored.id, stored);
    return Promise.resolve(stored);
  }

  updateRecord(id: string, rev: number, patch: Record<string, unknown>) {
    this.check();
    const current = this.records.get(id);
    if (!current || current.rev !== rev) return Promise.resolve(null);
    const stored = { ...current, ...patch, rev: rev + 1 };
    this.records.set(id, stored);
    return Promise.resolve(stored);
  }
}

const teamId = randomUUID();
const gameId = randomUUID();
let cache: Cache;
let client: FakeServer;
let outbox: Outbox;
let sent = 0;

beforeEach(() => {
  cache = new Cache(`outbox-test-${randomUUID()}`);
  client = new FakeServer();
  sent = 0;
  outbox = new Outbox(client, cache, teamId, randomUUID(), randomUUID(), () => {
    sent += 1;
  });
});

afterEach(async () => {
  await cache.delete();
});

describe('outbox', () => {
  it('shows an entry at once and sends it', async () => {
    const row = await outbox.appendEvent({ gameId, kind: 'note', text: 'Začala bouřka' });
    await outbox.flush();
    expect(await cache.events.get(row.id)).toMatchObject({ text: 'Začala bouřka' });
    expect(client.calls.map((call) => call.fn)).toEqual(['append_event']);
    expect(client.calls[0]?.args).toMatchObject({
      p_id: row.id,
      p_game: gameId,
      p_text: 'Začala bouřka',
    });
    expect(await cache.outbox.count()).toBe(0);
    expect(sent).toBe(1);
  });

  it('keeps entries while offline and sends them in order later', async () => {
    client.reply = () => new TypeError('Failed to fetch');
    const first = await outbox.appendEvent({ gameId, kind: 'note', text: 'první' });
    const reading = await outbox.recordReading({
      gameId,
      definitionId: randomUUID(),
      subjectId: randomUUID(),
      value: 2,
    });
    await outbox.flush();
    expect(await cache.outbox.count()).toBe(2);
    expect(await cache.readings.get(reading.id)).toMatchObject({ value: 2 });

    client.calls = [];
    client.reply = () => ({ data: null, error: null, status: 204 });
    await outbox.flush();
    expect(client.calls.map((call) => call.fn)).toEqual(['append_event', 'record_reading']);
    expect((client.calls[0]?.args as { p_id: string }).p_id).toBe(first.id);
    expect(await cache.outbox.count()).toBe(0);
  });

  it('marks a refused entry and lets the others through', async () => {
    client.reply = (fn) =>
      fn === 'record_reading'
        ? { data: null, error: { message: 'not allowed', code: '42501' }, status: 403 }
        : { data: null, error: null, status: 204 };
    const reading = await outbox.recordReading({
      gameId,
      definitionId: randomUUID(),
      subjectId: randomUUID(),
      value: 1,
    });
    await outbox.appendEvent({ gameId, kind: 'note', text: 'další' });
    await outbox.flush();
    const left = await cache.outbox.toArray();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: reading.id, error: 'not allowed' });

    await outbox.discard(reading.id);
    expect(await cache.outbox.count()).toBe(0);
    expect(await cache.readings.get(reading.id)).toBeUndefined();
  });

  it('marks a document delivered locally before the server answers', async () => {
    client.reply = () => new TypeError('Failed to fetch');
    const record = {
      id: randomUUID(),
      team_id: teamId,
      kind: 'prop_document',
      game_id: gameId,
      title: 'Dopis hraběnce',
      data: { status: 'printed' },
    } as unknown as RecordRow;
    await cache.records.put(record);
    await outbox.markDelivered(record);
    expect((await cache.records.get(record.id))?.data).toEqual({ status: 'delivered' });
    const [entry] = await cache.outbox.toArray();
    expect(entry).toMatchObject({ op: 'mark_delivered', args: { p_record: record.id } });
    expect(await cache.events.get(entry?.id ?? '')).toMatchObject({ kind: 'delivered' });
  });

  const queued = (title: string): QueuedRecord => ({
    id: randomUUID(),
    team_id: teamId,
    kind: 'page',
    title,
    data: {},
    world_id: null,
    game_id: gameId,
    parent_id: null,
    visibility: 'organizers',
    inherit_audience: false,
    sort_key: '',
    tags: [],
  });

  it('creates and edits records offline as one insert later', async () => {
    client.offline = true;
    const row = await outbox.createRecord(queued('Lipnov'));
    await outbox.updateRecord(row, { title: 'Lipnov nad Řekou', data: { summary: 'ves' } });
    expect((await cache.records.get(row.id))?.title).toBe('Lipnov nad Řekou');
    await outbox.flush();
    expect(await cache.outbox.count()).toBe(1);

    client.offline = false;
    await outbox.flush();
    expect(client.records.get(row.id)).toMatchObject({
      title: 'Lipnov nad Řekou',
      data: { summary: 'ves' },
      rev: 1,
    });
    expect(await cache.outbox.count()).toBe(0);
    expect((await cache.records.get(row.id))?.rev).toBe(1);
  });

  it('merges offline edits and applies them on the revision they started from', async () => {
    const original = await client.insertRecord(
      queued('Kovárna') as unknown as Record<string, unknown>,
    );
    await cache.records.put(original);
    client.offline = true;
    const first = await outbox.updateRecord(original, { title: 'Kovárna u brány' });
    await outbox.updateRecord(first, { data: { summary: 'kovář Ota' } });
    client.offline = false;
    await outbox.flush();
    expect(client.records.get(original.id)).toMatchObject({
      title: 'Kovárna u brány',
      data: { summary: 'kovář Ota' },
      rev: 2,
    });
  });

  it('turns an edit of a record changed meanwhile into a conflict', async () => {
    const original = await client.insertRecord(
      queued('Mlýn') as unknown as Record<string, unknown>,
    );
    await cache.records.put(original);
    client.offline = true;
    await outbox.updateRecord(original, { title: 'Mlýn na potoce' });
    await outbox.flush();
    // Someone else edits it on the server meanwhile.
    client.offline = false;
    await client.updateRecord(original.id, 1, { title: 'Starý mlýn' });
    await outbox.flush();
    const [entry] = await cache.outbox.toArray();
    expect(entry).toMatchObject({ error: CONFLICT, server: { title: 'Starý mlýn', rev: 2 } });

    await outbox.keepMine(original.id);
    expect(client.records.get(original.id)).toMatchObject({ title: 'Mlýn na potoce', rev: 3 });
    expect(await cache.outbox.count()).toBe(0);
  });

  it('keeps both versions as a copy when asked', async () => {
    const original = await client.insertRecord(
      queued('Mlýn') as unknown as Record<string, unknown>,
    );
    await cache.records.put(original);
    client.offline = true;
    await outbox.updateRecord(original, { title: 'Mlýn na potoce' });
    await outbox.flush();
    client.offline = false;
    await client.updateRecord(original.id, 1, { title: 'Starý mlýn' });
    await outbox.flush();
    await outbox.keepBoth(original.id, 'Mlýn na potoce (moje verze)');
    await outbox.flush();
    const titles = [...client.records.values()].map((row) => row.title).sort();
    expect(titles).toEqual(['Mlýn na potoce (moje verze)', 'Starý mlýn']);
    expect((await cache.records.get(original.id))?.title).toBe('Starý mlýn');
  });

  it('keeps an edit made while the record is on its way to the server', async () => {
    client.offline = true;
    const row = await outbox.createRecord(queued('Brod'));
    client.offline = false;
    // The insert is slow; the user edits the record meanwhile.
    let release: () => void = () => undefined;
    const insert = client.insertRecord.bind(client);
    client.insertRecord = (input) =>
      new Promise((resolve) => {
        release = () => void insert(input).then(resolve);
      });
    const sending = outbox.flush();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await outbox.updateRecord({ ...row }, { title: 'Brod u mlýna' });
    release();
    await sending;
    await outbox.flush();
    expect(client.records.get(row.id)).toMatchObject({ title: 'Brod u mlýna', rev: 2 });
    expect(await cache.outbox.count()).toBe(0);
    expect((await cache.records.get(row.id))?.title).toBe('Brod u mlýna');
  });
});
