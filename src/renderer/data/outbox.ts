import type { EventKind, EventRow, ReadingRow, RecordRow } from '@core/model';
import type { Cache, OutboxRow } from './cache';
import { classifyError } from './remote';
import { call, type Response } from './call';

/** What the outbox needs from the server (Supabase in the app, fakes in tests). */
export interface OutboxServer {
  /** Calls a server function (supabase-js `client.rpc`). */
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Response>;
  /** Reads one record from the server. */
  fetchRecord(id: string): Promise<RecordRow>;
  /** Inserts a record with its client-made id and returns the stored row. */
  insertRecord(row: Record<string, unknown>): Promise<RecordRow>;
  /** Updates a record only if it is still at `rev`; null when someone was faster. */
  updateRecord(id: string, rev: number, patch: Record<string, unknown>): Promise<RecordRow | null>;
}

/** A new record as the app creates it (the server fills in the rest). */
export interface QueuedRecord {
  id: string;
  team_id: string;
  kind: string;
  title: string;
  data: Record<string, unknown>;
  world_id: string | null;
  game_id: string | null;
  parent_id: string | null;
  visibility: RecordRow['visibility'];
  inherit_audience: boolean;
  sort_key: string;
  tags: string[];
}

/**
 * Writes made without a connection (docs/PLAN.md §2.10). Live-game entries
 * (event log, tracker readings, "doručeno") and, since M8, new and edited
 * records. Each shows at once from the local cache and waits here; the queue
 * is sent whenever the server is reachable. Log entries carry the id of the
 * row they create, so sending one twice is harmless; record edits carry the
 * revision they were made on, so an edit to something that changed
 * meanwhile becomes a conflict for the user to resolve instead of silently
 * overwriting someone else's work.
 */
export class Outbox {
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    private readonly server: OutboxServer,
    private readonly cache: Cache,
    private readonly teamId: string,
    private readonly personId: string,
    private readonly userId: string,
    /** Called after something was sent, e.g. to pull the server's rows. */
    private readonly onSent: () => void = () => undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private base(gameId: string) {
    const at = this.now().toISOString();
    return {
      id: crypto.randomUUID(),
      team_id: this.teamId,
      game_id: gameId,
      at,
      author_id: this.userId,
      author_person: this.personId,
      created_at: at,
      updated_at: at,
    };
  }

  private async enqueue(
    entry: Omit<OutboxRow, 'team_id' | 'error' | 'created_at'>,
    apply: () => Promise<unknown>,
  ) {
    await this.cache.transaction(
      'rw',
      [this.cache.outbox, this.cache.events, this.cache.readings, this.cache.records],
      async () => {
        await this.cache.outbox.put({
          ...entry,
          team_id: this.teamId,
          created_at: this.now().toISOString(),
          error: null,
        });
        await apply();
      },
    );
    void this.flush();
  }

  async appendEvent(input: {
    gameId: string;
    kind: EventKind;
    text: string;
    recordId?: string | null;
  }): Promise<EventRow> {
    const row: EventRow = {
      ...this.base(input.gameId),
      kind: input.kind,
      text: input.text,
      record_id: input.recordId ?? null,
    };
    await this.enqueue(
      {
        id: row.id,
        op: 'append_event',
        args: {
          p_id: row.id,
          p_game: row.game_id,
          p_kind: row.kind,
          p_text: row.text,
          p_record: row.record_id,
          p_at: row.at,
        },
      },
      () => this.cache.events.put(row),
    );
    return row;
  }

  async recordReading(input: {
    gameId: string;
    definitionId: string;
    subjectId: string;
    value: number | null;
    text?: string;
  }): Promise<ReadingRow> {
    const row: ReadingRow = {
      ...this.base(input.gameId),
      definition_id: input.definitionId,
      subject_id: input.subjectId,
      value: input.value,
      text: input.text ?? '',
    };
    await this.enqueue(
      {
        id: row.id,
        op: 'record_reading',
        args: {
          p_id: row.id,
          p_definition: row.definition_id,
          p_subject: row.subject_id,
          p_value: row.value,
          p_text: row.text,
          p_at: row.at,
        },
      },
      () => this.cache.readings.put(row),
    );
    return row;
  }

  /** "Doručeno" / "Hotovo": the record changes locally at once, like the server will. */
  async markDelivered(record: RecordRow): Promise<void> {
    if (!record.game_id) return;
    const event: EventRow = {
      ...this.base(record.game_id),
      kind: 'delivered',
      text: record.title,
      record_id: record.id,
    };
    const data =
      record.kind === 'prop_document'
        ? { ...record.data, status: 'delivered' }
        : { ...record.data, done: true };
    await this.enqueue(
      {
        id: event.id,
        op: 'mark_delivered',
        args: { p_event: event.id, p_record: record.id, p_at: event.at },
      },
      async () => {
        await this.cache.events.put(event);
        await this.cache.records.update(record.id, { data });
      },
    );
  }

  // --- Records (M8) -----------------------------------------------------------

  /** Whether a record has a change waiting (its later edits must queue behind it). */
  async has(recordId: string): Promise<boolean> {
    const entry = await this.cache.outbox.get(recordId);
    return entry?.op === 'create_record' || entry?.op === 'update_record';
  }

  /** A record created offline: shown at once, inserted later with the same id. */
  async createRecord(input: QueuedRecord): Promise<RecordRow> {
    const at = this.now().toISOString();
    const row: RecordRow = {
      ...input,
      rev: 0,
      created_by: this.userId,
      created_at: at,
      updated_by: this.userId,
      updated_at: at,
      deleted_by: null,
      deleted_at: null,
    };
    await this.enqueue({ id: row.id, op: 'create_record', args: { row: input } }, () =>
      this.cache.records.put(row),
    );
    return row;
  }

  /**
   * An edit made offline. Later edits of the same record merge into the
   * waiting one, so the server sees one change made on the revision the
   * user started from.
   */
  async updateRecord(record: RecordRow, patch: Record<string, unknown>): Promise<RecordRow> {
    const waiting = await this.cache.outbox.get(record.id);
    const local = { ...record, ...patch };
    await this.cache.transaction('rw', [this.cache.outbox, this.cache.records], async () => {
      if (waiting?.op === 'create_record') {
        const row = waiting.args['row'] as Record<string, unknown>;
        await this.cache.outbox.update(record.id, { args: { row: { ...row, ...patch } } });
      } else if (waiting?.op === 'update_record') {
        const previous = waiting.args['patch'] as Record<string, unknown>;
        await this.cache.outbox.update(record.id, {
          args: { ...waiting.args, patch: { ...previous, ...patch } },
        });
      } else {
        await this.cache.outbox.put({
          id: record.id,
          team_id: this.teamId,
          op: 'update_record',
          args: { expected_rev: record.rev, patch },
          created_at: this.now().toISOString(),
          error: null,
        });
      }
      await this.cache.records.put(local);
    });
    void this.flush();
    return local;
  }

  /** Sends what is waiting, oldest first. Calls made meanwhile join the running one. */
  flush(): Promise<void> {
    if (this.running) {
      // Something was queued after the running pass read the queue: go again.
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.send();
        } while (this.queuedMeanwhile());
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private queuedMeanwhile(): boolean {
    return this.again;
  }

  /** Sends one entry; for records, returns the row the server stored. */
  private async sendOne(row: OutboxRow): Promise<RecordRow | null> {
    if (row.op === 'create_record') {
      const input = row.args['row'] as Record<string, unknown>;
      try {
        return await this.server.insertRecord(input);
      } catch (thrown) {
        // Inserted on an earlier try whose answer got lost.
        if (classifyError(thrown).code !== '23505') throw thrown;
        return this.server.fetchRecord(row.id);
      }
    }
    if (row.op === 'update_record') {
      const rev = row.args['expected_rev'] as number;
      const patch = row.args['patch'] as Record<string, unknown>;
      const stored = await this.server.updateRecord(row.id, rev, patch);
      if (!stored) throw new ConflictError(await this.server.fetchRecord(row.id));
      return stored;
    }
    await call(this.server.rpc(row.op, row.args));
    return null;
  }

  /**
   * After a send: the entry is done, unless the user changed the record again
   * while it was on its way. Then the newer change stays queued as an edit of
   * the revision the server just stored.
   */
  private async settle(row: OutboxRow, stored: RecordRow | null): Promise<void> {
    await this.cache.transaction('rw', [this.cache.outbox, this.cache.records], async () => {
      const now = await this.cache.outbox.get(row.id);
      const changed = now !== undefined && JSON.stringify(now.args) !== JSON.stringify(row.args);
      if (!changed || !stored) {
        await this.cache.outbox.delete(row.id);
        if (stored) await this.cache.records.put(stored);
        return;
      }
      const patch =
        now.op === 'create_record'
          ? editableFields(now.args['row'] as Record<string, unknown>)
          : (now.args['patch'] as Record<string, unknown>);
      await this.cache.outbox.put({
        ...now,
        op: 'update_record',
        args: { expected_rev: stored.rev, patch },
        error: null,
      });
      this.again = true;
    });
  }

  private async send(): Promise<void> {
    const waiting = (
      await this.cache.outbox.where('team_id').equals(this.teamId).sortBy('created_at')
    ).filter((row) => row.error === null);
    let sent = false;
    for (const row of waiting) {
      try {
        await this.settle(row, await this.sendOne(row));
        sent = true;
      } catch (thrown) {
        if (thrown instanceof ConflictError) {
          await this.cache.outbox.update(row.id, { error: CONFLICT, server: thrown.server });
          continue;
        }
        const error = classifyError(thrown);
        // No connection, a paused project or an expired sign-in: try later.
        if (error.kind === 'offline' || error.kind === 'paused' || error.kind === 'auth') break;
        await this.cache.outbox.update(row.id, { error: error.message });
      }
    }
    if (sent) this.onSent();
  }

  /** Puts a refused entry back in the queue. */
  async retry(id: string): Promise<void> {
    await this.cache.outbox.update(id, { error: null });
    await this.flush();
  }

  /** Conflict: apply my edit on top of the server's newer version. */
  async keepMine(id: string): Promise<void> {
    const entry = await this.cache.outbox.get(id);
    if (entry?.op !== 'update_record' || !entry.server) return;
    await this.cache.outbox.update(id, {
      args: { ...entry.args, expected_rev: entry.server.rev },
      error: null,
      server: undefined,
    });
    await this.flush();
  }

  /** Conflict: keep the server's version and also save mine as a copy. */
  async keepBoth(id: string, copyTitle: string): Promise<void> {
    const entry = await this.cache.outbox.get(id);
    if (entry?.op !== 'update_record' || !entry.server) return;
    const server = entry.server;
    const mine = { ...server, ...(entry.args['patch'] as Record<string, unknown>) };
    await this.discard(id);
    await this.createRecord({
      id: crypto.randomUUID(),
      team_id: server.team_id,
      kind: mine.kind,
      title: copyTitle,
      data: mine.data,
      world_id: mine.world_id,
      game_id: mine.game_id,
      parent_id: mine.parent_id,
      visibility: 'organizers',
      inherit_audience: mine.inherit_audience,
      sort_key: mine.sort_key,
      tags: mine.tags,
    });
  }

  /** Drops a refused entry and the local change it showed. */
  async discard(id: string): Promise<void> {
    const entry = await this.cache.outbox.get(id);
    await this.cache.transaction(
      'rw',
      [this.cache.outbox, this.cache.events, this.cache.readings, this.cache.records],
      async () => {
        await this.cache.outbox.delete(id);
        await this.cache.events.delete(id);
        await this.cache.readings.delete(id);
        if (entry?.op === 'create_record') await this.cache.records.delete(id);
        if (entry?.server) await this.cache.records.put(entry.server);
      },
    );
    // Undo a local "doručeno" or edit by reading the record back from the server.
    const recordId =
      entry?.op === 'mark_delivered'
        ? entry.args['p_record']
        : entry?.op === 'update_record' && !entry.server
          ? entry.id
          : undefined;
    if (typeof recordId === 'string') {
      try {
        await this.cache.records.put(await this.server.fetchRecord(recordId));
      } catch {
        // Unreachable: the local copy stays until the record changes on the server.
      }
    }
  }
}

/** The fields of a new record that a later edit may change. */
function editableFields(row: Record<string, unknown>): Record<string, unknown> {
  const fields = [
    'title',
    'data',
    'world_id',
    'game_id',
    'parent_id',
    'inherit_audience',
    'sort_key',
    'tags',
  ];
  return Object.fromEntries(fields.filter((key) => key in row).map((key) => [key, row[key]]));
}

/** The error text stored on an outbox entry whose record changed meanwhile. */
export const CONFLICT = 'conflict';

class ConflictError extends Error {
  constructor(readonly server: RecordRow) {
    super(CONFLICT);
    this.name = 'ConflictError';
  }
}
