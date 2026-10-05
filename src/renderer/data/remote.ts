/**
 * The few read operations the sync engine needs from the server. Supabase
 * implements it in ./supabase-remote.ts; tests use an in-memory fake.
 */
export type SyncTable =
  | 'teams'
  | 'people'
  | 'team_members'
  | 'invites'
  | 'records'
  | 'record_secrets'
  | 'record_access'
  | 'record_people'
  | 'record_links'
  | 'file_locks'
  | 'file_text'
  | 'registrations'
  | 'event_log'
  | 'tracker_readings';

export interface SelectOptions {
  /** Equality filter, e.g. team_id = X. */
  eq?: { column: string; value: string };
  /** Only rows with updated_at >= since (ISO timestamp). */
  since?: string;
  /** Column list; defaults to all columns. */
  columns?: string;
  /** Only rows whose column is one of these values (keep lists short, ~100). */
  in?: { column: string; values: string[] };
}

export interface Remote {
  /** Every matching row the current user may read (paginates internally). */
  selectAll(table: SyncTable, options?: SelectOptions): Promise<unknown[]>;
}

export type RemoteErrorKind = 'offline' | 'paused' | 'auth' | 'conflict' | 'denied' | 'server';

export class RemoteError extends Error {
  constructor(
    readonly kind: RemoteErrorKind,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

/** Maps a Supabase/PostgREST error (or a thrown fetch error) to what the UI needs. */
export function classifyError(error: unknown): RemoteError {
  if (error instanceof RemoteError) return error;
  const record = (typeof error === 'object' && error !== null ? error : {}) as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
  };
  const message = typeof record.message === 'string' ? record.message : String(error);
  const code = typeof record.code === 'string' ? record.code : undefined;
  const status = typeof record.status === 'number' ? record.status : undefined;

  if (status === 540 || /project.*paused|paused.*project/i.test(message)) {
    return new RemoteError('paused', message, code);
  }
  if (
    status === 0 ||
    /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(message)
  ) {
    return new RemoteError('offline', message, code);
  }
  if (status === 401 || code === 'PGRST301' || /jwt expired|invalid jwt/i.test(message)) {
    return new RemoteError('auth', message, code);
  }
  if (code === '42501' || /row-level security|permission denied|only organizers/i.test(message)) {
    return new RemoteError('denied', message, code);
  }
  return new RemoteError('server', message, code);
}
