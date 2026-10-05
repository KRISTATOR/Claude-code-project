import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RecordRow } from '@core/model';
import { Cache } from './cache';
import { Outbox } from './outbox';

type Reply = { data: unknown; error: { message: string; code?: string } | null; status: number };

/** Just enough of supabase-js: rpc() answers with whatever `reply` says. */
class FakeClient {
  calls: { fn: string; args: unknown }[] = [];
  reply: (fn: string) => Reply | Error = () => ({ data: null, error: null, status: 204 });
  rpc(fn: string, args: unknown): Promise<Reply> {
    this.calls.push({ fn, args });
    const reply = this.reply(fn);
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  }
}

const teamId = randomUUID();
const gameId = randomUUID();
let cache: Cache;
let client: FakeClient;
let outbox: Outbox;
let sent = 0;

beforeEach(() => {
  cache = new Cache(`outbox-test-${randomUUID()}`);
  client = new FakeClient();
  sent = 0;
  outbox = new Outbox(
    (fn, args) => client.rpc(fn, args),
    () => Promise.reject(new Error('not used')),
    cache,
    teamId,
    randomUUID(),
    randomUUID(),
    () => {
      sent += 1;
    },
  );
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
});
