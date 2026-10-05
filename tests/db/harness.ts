import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

/**
 * Runs SQL as Supabase would: as the `authenticated` role with the user's id in
 * the JWT claims, so RLS applies exactly as it does for the real app.
 *
 * Backend: PGlite by default (no services needed). Set ZAZEMI_TEST_DB_URL to run
 * against a real Postgres that already has the migrations applied, e.g. the
 * local stack (scripts/local-stack) or `supabase db start` in CI.
 */
export interface TestDb {
  /** Runs as the database owner (bypasses RLS). For test setup only. */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs as a signed-in user; `null` means the anonymous role. */
  as<T = Record<string, unknown>>(
    user: string | null,
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  close(): Promise<void>;
}

const ROOT = join(import.meta.dirname, '../..');

export function migrationFiles(): string[] {
  const dir = join(ROOT, 'supabase/migrations');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => join(dir, name));
}

interface Executor {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

async function pgliteExecutor(): Promise<Executor> {
  const db = new PGlite();
  await db.exec(readFileSync(join(ROOT, 'tests/db/supabase-stub.sql'), 'utf8'));
  for (const file of migrationFiles()) await db.exec(readFileSync(file, 'utf8'));
  return {
    query: async (sql, params) => db.query(sql, params),
    exec: async (sql) => {
      await db.exec(sql);
    },
    close: () => db.close(),
  };
}

async function pgExecutor(url: string): Promise<Executor> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    query: async (sql, params) => client.query(sql, params),
    exec: async (sql) => {
      await client.query(sql);
    },
    close: () => client.end(),
  };
}

export async function openTestDb(): Promise<TestDb> {
  const url = process.env['ZAZEMI_TEST_DB_URL'];
  const executor = url ? await pgExecutor(url) : await pgliteExecutor();
  // One connection, so queries must not interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    admin: <T>(sql: string, params?: unknown[]) =>
      serial(async () => (await executor.query(sql, params)).rows as T[]),
    as: <T>(user: string | null, sql: string, params?: unknown[]) =>
      serial(async () => {
        const claims = JSON.stringify(
          user ? { sub: user, role: 'authenticated' } : { role: 'anon' },
        );
        await executor.exec('begin');
        try {
          await executor.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
          await executor.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
          const result = (await executor.query(sql, params)).rows as T[];
          await executor.exec('commit');
          return result;
        } catch (error) {
          await executor.exec('rollback');
          throw error;
        }
      }),
    close: () => executor.close(),
  };
}

/** Creates an auth user (as Supabase Auth would) and returns its id. */
export async function createUser(db: TestDb, label: string): Promise<string> {
  const id = randomUUID();
  await db.admin('insert into auth.users (id, email) values ($1, $2)', [
    id,
    `${label}-${id.slice(0, 8)}@example.test`,
  ]);
  return id;
}
