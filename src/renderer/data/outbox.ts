import { type EventKind, type EventRow, type ReadingRow, type RecordRow } from '@core/model';
import type { Cache, OutboxRow } from './cache';
import { classifyError } from './remote';
import { call, type Response } from './call';

/**
 * Live-game writes that must work in a field with no signal (docs/PLAN.md
 * §2.10): event-log entries, tracker readings and "doručeno" marks. Each is
 * shown at once from the local cache and queued here; the queue is sent
 * whenever the server is reachable. Every entry carries the id of the row
 * it creates, and the server functions ignore ids they have already seen,
 * so sending the same entry twice is harmless.
 */
export class Outbox {
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    /** Calls a server function (supabase-js `client.rpc`). */
    private readonly rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<Response>,
    /** Reads one record back from the server. */
    private readonly fetchRecord: (id: string) => Promise<RecordRow>,
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

  private async send(): Promise<void> {
    const waiting = (
      await this.cache.outbox.where('team_id').equals(this.teamId).sortBy('created_at')
    ).filter((row) => row.error === null);
    let sent = false;
    for (const row of waiting) {
      try {
        await call(this.rpc(row.op, row.args));
        await this.cache.outbox.delete(row.id);
        sent = true;
      } catch (thrown) {
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

  /** Drops a refused entry and the local row it showed. */
  async discard(id: string): Promise<void> {
    const entry = await this.cache.outbox.get(id);
    await this.cache.transaction(
      'rw',
      [this.cache.outbox, this.cache.events, this.cache.readings],
      async () => {
        await this.cache.outbox.delete(id);
        await this.cache.events.delete(id);
        await this.cache.readings.delete(id);
      },
    );
    // Undo a local "doručeno" by reading the record back from the server.
    const recordId = entry?.op === 'mark_delivered' ? entry.args['p_record'] : undefined;
    if (typeof recordId === 'string') {
      try {
        await this.cache.records.put(await this.fetchRecord(recordId));
      } catch {
        // Unreachable: the local copy stays until the record changes on the server.
      }
    }
  }
}
