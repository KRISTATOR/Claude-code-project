import type { OfficeEvent } from '@shared/api';
import type { RecordRow } from '@core/model';
import type { Cache } from '../data/cache';
import type { FilesService } from '../data/files';

export type SessionState = 'opening' | 'open' | 'saving' | 'lost' | 'closing';

export interface EditSession {
  fileId: string;
  sessionId: string;
  name: string;
  state: SessionState;
  /** Office created no lock file: the user must click "Hotovo" when done. */
  needsManualDone: boolean;
  lastSavedAt: number | null;
  conflict: boolean;
  error: string | null;
}

export interface OfficeNotices {
  saved(name: string, conflict: boolean): void;
  lost(name: string): void;
  error(name: string, error: unknown): void;
  finished(name: string): void;
}

const HEARTBEAT_MS = 60_000;

/**
 * Check-out/check-in from the renderer side (docs/PLAN.md §2.6). Main watches
 * the working copy; this turns its events into versions and keeps the lock
 * alive. Sessions survive restarts: main remembers them, we resume here.
 */
export class OfficeController {
  private sessions = new Map<string, EditSession>();
  private snapshot: EditSession[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private queue = new Map<string, Promise<void>>();

  constructor(
    private readonly files: FilesService,
    private readonly cache: Cache,
    private readonly machine: string,
    private readonly notices: OfficeNotices,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EditSession[] => this.snapshot;

  private update(fileId: string, patch: Partial<EditSession>): void {
    const current = this.sessions.get(fileId);
    if (!current) return;
    this.sessions.set(fileId, { ...current, ...patch });
    this.publish();
  }

  private publish(): void {
    this.snapshot = [...this.sessions.values()];
    for (const listener of this.listeners) listener();
  }

  /** Serialises work per file so saves never overlap. */
  private enqueue(fileId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queue.get(fileId) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queue.set(
      fileId,
      next.catch(() => undefined),
    );
    return next;
  }

  async start(): Promise<void> {
    this.unsubscribe = window.zazemi.office.onEvent((event) => void this.onEvent(event));
    this.timer = setInterval(() => void this.heartbeatAll(), HEARTBEAT_MS);
    // Resume sessions from a previous run (restart, crash).
    for (const info of await window.zazemi.office.sessions()) {
      const record = await this.cache.records.get(info.fileId);
      if (!record) continue;
      this.sessions.set(info.fileId, {
        fileId: info.fileId,
        sessionId: info.sessionId,
        name: info.name,
        state: 'open',
        needsManualDone: !info.lockPresent,
        lastSavedAt: null,
        conflict: false,
        error: null,
      });
      this.publish();
      const alive = await this.files.heartbeat(info.fileId, info.sessionId).catch(() => null);
      if (alive === false) this.update(info.fileId, { state: 'lost' });
      if (info.pendingChange) void this.enqueue(info.fileId, () => this.upload(info.fileId));
    }
  }

  stop(): void {
    this.unsubscribe?.();
    if (this.timer) clearInterval(this.timer);
  }

  isEditing(fileId: string): boolean {
    return this.sessions.has(fileId);
  }

  async openForEdit(record: RecordRow): Promise<void> {
    const existing = this.sessions.get(record.id);
    const sessionId = existing?.sessionId ?? (await this.files.checkout(record, this.machine));
    const { sha } = await this.files.getBytes(record);
    if (!existing) {
      this.sessions.set(record.id, {
        fileId: record.id,
        sessionId,
        name: record.title,
        state: 'opening',
        needsManualDone: false,
        lastSavedAt: null,
        conflict: false,
        error: null,
      });
      this.publish();
    }
    const result = await window.zazemi.office.openForEdit({
      fileId: record.id,
      sessionId,
      name: record.title,
      sha,
    });
    if (!result.ok) {
      await this.files.release(record.id, sessionId).catch(() => undefined);
      await window.zazemi.office.discard(record.id);
      this.sessions.delete(record.id);
      this.publish();
      throw new Error(result.message);
    }
    this.update(record.id, { state: 'open' });
  }

  private async onEvent(event: OfficeEvent): Promise<void> {
    if (!this.sessions.has(event.fileId)) return;
    if (event.type === 'saved') await this.enqueue(event.fileId, () => this.upload(event.fileId));
    else if (event.type === 'closed') await this.done(event.fileId);
    else this.update(event.fileId, { needsManualDone: true });
  }

  /** Uploads the working copy as the session's version. */
  private async upload(fileId: string): Promise<void> {
    const session = this.sessions.get(fileId);
    const record = await this.cache.records.get(fileId);
    if (!session || !record) return;
    const working = await window.zazemi.office.readWorking(fileId);
    if (!working) return;
    this.update(fileId, { state: 'saving' });
    try {
      const result = await this.files.storeVersion(record, working.data, {
        session: session.sessionId,
        base: null,
      });
      await window.zazemi.office.markUploaded(fileId, working.sha);
      this.update(fileId, {
        state: result.conflict ? 'lost' : 'open',
        lastSavedAt: Date.now(),
        conflict: result.conflict,
        error: null,
      });
      this.notices.saved(record.title, result.conflict);
    } catch (error) {
      this.update(fileId, { state: 'open', error: String(error) });
      this.notices.error(record.title, error);
    }
  }

  /** "Hotovo": upload any last change, release the lock, forget the session. */
  done(fileId: string): Promise<void> {
    return this.enqueue(fileId, async () => {
      const session = this.sessions.get(fileId);
      if (!session) return;
      this.update(fileId, { state: 'closing' });
      const finished = await window.zazemi.office.finish(fileId);
      if (finished.changed) {
        await this.upload(fileId);
        const after = this.sessions.get(fileId);
        if (after?.error) return; // keep the session so nothing is lost
      }
      await this.files.release(fileId, session.sessionId).catch(() => undefined);
      await window.zazemi.office.discard(fileId);
      this.sessions.delete(fileId);
      this.publish();
      this.notices.finished(session.name);
    });
  }

  /** "Uložit jako verzi": the current state stays as its own version. */
  async keepVersion(fileId: string): Promise<void> {
    const session = this.sessions.get(fileId);
    if (session) await this.files.keepSessionVersion(fileId, session.sessionId);
  }

  private async heartbeatAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.state === 'lost') continue;
      const alive = await this.files.heartbeat(session.fileId, session.sessionId).catch(() => null);
      if (alive === false) {
        this.update(session.fileId, { state: 'lost' });
        this.notices.lost(session.name);
      }
    }
  }
}
