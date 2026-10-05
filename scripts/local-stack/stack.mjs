#!/usr/bin/env node
/**
 * A local "mini Supabase" for development and end-to-end tests where Docker
 * images are unavailable: real PostgreSQL + PostgREST + Supabase Auth (GoTrue)
 * behind a small gateway that mimics Supabase's URL layout and CORS.
 * Supabase Storage is built from source (git clone, pinned commit) and runs
 * with its file backend. Realtime and Edge Functions are not included.
 *
 *   node scripts/local-stack/stack.mjs start   # foreground; Ctrl+C stops everything
 *   node scripts/local-stack/stack.mjs reset   # wipe the database
 *
 * Connection details are written to .local-stack/env.json (git-ignored).
 * CI uses the official Supabase CLI stack instead (see .github/workflows/ci.yml).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = join(ROOT, '.local-stack');
const BIN = process.env.ZAZEMI_STACK_BIN ?? join(STATE, 'bin');
const PG_DIR = join(tmpdir(), 'zazemi-stack-pg');
const PG_BIN = process.env.ZAZEMI_PG_BIN ?? '/usr/lib/postgresql/16/bin';
const PORTS = { gateway: 54321, db: 54322, rest: 54330, auth: 54331, storage: 54332 };
const VERSIONS = { postgrest: 'v13.0.4', auth: 'v2.178.0', storage: '307c5e3' };
const STORAGE_DIR = join(STATE, 'storage');
const STORAGE_FILES = join(tmpdir(), 'zazemi-stack-files');
const isRoot = process.getuid?.() === 0;

function log(message) {
  console.log(`[stack] ${message}`);
}

function run(cmd, args, options = {}) {
  const asPostgres = options.asPostgres && isRoot;
  const result = spawnSync(
    asPostgres ? 'runuser' : cmd,
    asPostgres ? ['-u', 'postgres', '--', cmd, ...args] : args,
    {
      cwd: options.cwd,
      stdio: options.quiet ? 'pipe' : 'inherit',
      encoding: 'utf8',
      env: { ...process.env, ...options.env },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed:\n${result.stderr ?? ''}${result.stdout ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

function ensureBinaries() {
  mkdirSync(BIN, { recursive: true });
  if (!existsSync(join(BIN, 'postgrest'))) {
    log('downloading PostgREST');
    const url = `https://github.com/PostgREST/postgrest/releases/download/${VERSIONS.postgrest}/postgrest-${VERSIONS.postgrest}-linux-static-x86-64.tar.xz`;
    run('sh', ['-c', `curl -sSL "${url}" | tar xJ -C "${BIN}"`]);
  }
  if (!existsSync(join(BIN, 'auth'))) {
    log('downloading Supabase Auth');
    const url = `https://github.com/supabase/auth/releases/download/${VERSIONS.auth}/auth-${VERSIONS.auth}-x86.tar.gz`;
    run('sh', ['-c', `curl -sSL "${url}" | tar xz -C "${BIN}"`]);
  }
}

/** Supabase Storage needs Node >= 24 officially; it runs fine on 22 for our use. */
function ensureStorage() {
  if (existsSync(join(STORAGE_DIR, 'dist/start/server.js'))) return;
  log('building Supabase Storage from source (one-off, ~2 minutes)');
  rmSync(STORAGE_DIR, { recursive: true, force: true });
  run('git', ['clone', '--quiet', 'https://github.com/supabase/storage.git', STORAGE_DIR]);
  run('git', ['-C', STORAGE_DIR, 'checkout', '--quiet', VERSIONS.storage]);
  const opts = { quiet: true, cwd: STORAGE_DIR };
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--engine-strict=false'], opts);
  run('npm', ['rebuild', 'fs-xattr'], opts);
  run('node', ['./build.js'], opts);
  run('npx', ['resolve-tspaths'], opts);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signJwt(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function loadOrCreateSecrets() {
  mkdirSync(STATE, { recursive: true });
  const file = join(STATE, 'secrets.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const jwtSecret = randomBytes(32).toString('hex');
  const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  const secrets = {
    jwtSecret,
    anonKey: signJwt({ role: 'anon', iss: 'zazemi-local', exp }, jwtSecret),
    serviceKey: signJwt({ role: 'service_role', iss: 'zazemi-local', exp }, jwtSecret),
  };
  writeFileSync(file, JSON.stringify(secrets, null, 2));
  return secrets;
}

function psql(sql, { file, db = 'postgres', quiet = true } = {}) {
  const args = [
    '-h',
    PG_DIR,
    '-p',
    String(PORTS.db),
    '-U',
    'postgres',
    '-d',
    db,
    '-v',
    'ON_ERROR_STOP=1',
    '-q',
  ];
  if (file) args.push('-f', file);
  else args.push('-c', sql);
  return run('psql', args, { quiet });
}

function initDatabase() {
  if (!existsSync(join(PG_DIR, 'data', 'PG_VERSION'))) {
    log('initialising PostgreSQL');
    mkdirSync(join(PG_DIR, 'data'), { recursive: true });
    if (isRoot) run('chown', ['-R', 'postgres:postgres', PG_DIR]);
    run(
      join(PG_BIN, 'initdb'),
      [
        '-D',
        join(PG_DIR, 'data'),
        '-U',
        'postgres',
        '--auth=trust',
        '-E',
        'UTF8',
        '--locale=C.UTF-8',
      ],
      {
        asPostgres: true,
        quiet: true,
      },
    );
  }
}

function startPostgres() {
  const proc = spawn(
    isRoot ? 'runuser' : join(PG_BIN, 'postgres'),
    [
      ...(isRoot ? ['-u', 'postgres', '--', join(PG_BIN, 'postgres')] : []),
      '-D',
      join(PG_DIR, 'data'),
      '-p',
      String(PORTS.db),
      '-k',
      PG_DIR,
      '-c',
      'listen_addresses=127.0.0.1',
      '-c',
      'wal_level=logical',
      '-c',
      'fsync=off',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  proc.stderr.on('data', (chunk) => {
    const text = String(chunk);
    if (/ERROR|FATAL|PANIC/.test(text) && !/does not exist|already exists/.test(text))
      process.stderr.write(`[postgres] ${text}`);
  });
  return proc;
}

async function waitFor(check, label, timeoutMs = 30000) {
  const start = Date.now();
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // keep waiting
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

function applyMigrations() {
  psql(null, { file: join(ROOT, 'scripts/local-stack/init.sql') });
  psql(`create table if not exists public._local_migrations (name text primary key, applied_at timestamptz default now());
        revoke all on public._local_migrations from anon, authenticated;`);
  const out = run(
    'psql',
    [
      '-h',
      PG_DIR,
      '-p',
      String(PORTS.db),
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-c',
      'select name from public._local_migrations',
    ],
    { quiet: true },
  );
  const applied = new Set(out.split('\n').map((name) => name.trim()));
  const dir = join(ROOT, 'supabase/migrations');
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if (applied.has(name)) continue;
    log(`migration ${name}`);
    psql(null, { file: join(dir, name) });
    psql(`insert into public._local_migrations(name) values ('${name.replace(/'/g, "''")}')`);
  }
  psql(`notify pgrst, 'reload schema'`);
}

function startAuth(secrets) {
  return spawn(join(BIN, 'auth'), [], {
    cwd: BIN,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      GOTRUE_DB_DRIVER: 'postgres',
      DATABASE_URL: `postgres://supabase_auth_admin@127.0.0.1:${PORTS.db}/postgres?search_path=auth&sslmode=disable`,
      GOTRUE_DB_MIGRATIONS_PATH: join(BIN, 'migrations'),
      GOTRUE_API_HOST: '127.0.0.1',
      PORT: String(PORTS.auth),
      API_EXTERNAL_URL: `http://127.0.0.1:${PORTS.gateway}/auth/v1`,
      GOTRUE_SITE_URL: 'http://127.0.0.1',
      GOTRUE_JWT_SECRET: secrets.jwtSecret,
      GOTRUE_JWT_EXP: '3600',
      GOTRUE_JWT_AUD: 'authenticated',
      GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_JWT_ADMIN_ROLES: 'service_role',
      GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
      GOTRUE_MAILER_AUTOCONFIRM: 'true',
      GOTRUE_DISABLE_SIGNUP: 'false',
      GOTRUE_RATE_LIMIT_HEADER: '',
      GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '10000',
      GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS: '10000',
      GOTRUE_RATE_LIMIT_VERIFY: '10000',
      GOTRUE_LOG_LEVEL: 'warn',
    },
  });
}

function startStorage(secrets) {
  mkdirSync(STORAGE_FILES, { recursive: true });
  return spawn('node', ['dist/start/server.js'], {
    cwd: STORAGE_DIR,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'production',
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: String(PORTS.storage),
      SERVER_ADMIN_PORT: String(PORTS.storage + 1),
      AUTH_JWT_SECRET: secrets.jwtSecret,
      AUTH_JWT_ALGORITHM: 'HS256',
      ANON_KEY: secrets.anonKey,
      SERVICE_KEY: secrets.serviceKey,
      DATABASE_URL: `postgres://postgres@127.0.0.1:${PORTS.db}/postgres`,
      DB_INSTALL_ROLES: 'false',
      DB_ANON_ROLE: 'anon',
      DB_SERVICE_ROLE: 'service_role',
      DB_AUTHENTICATED_ROLE: 'authenticated',
      DB_SUPER_USER: 'postgres',
      STORAGE_BACKEND: 'file',
      FILE_STORAGE_BACKEND_PATH: STORAGE_FILES,
      STORAGE_S3_BUCKET: 'local',
      TENANT_ID: 'local',
      REGION: 'local',
      GLOBAL_S3_BUCKET: 'local',
      UPLOAD_FILE_SIZE_LIMIT: String(50 * 1024 * 1024),
      LOG_LEVEL: 'error',
    },
  });
}

function startRest(secrets) {
  return spawn(join(BIN, 'postgrest'), [], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      PGRST_DB_URI: `postgres://authenticator@127.0.0.1:${PORTS.db}/postgres`,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions',
      PGRST_JWT_SECRET: secrets.jwtSecret,
      PGRST_SERVER_HOST: '127.0.0.1',
      PGRST_SERVER_PORT: String(PORTS.rest),
      PGRST_DB_CHANNEL_ENABLED: 'true',
      PGRST_LOG_LEVEL: 'error',
    },
  });
}

/** Routes /auth/v1 and /rest/v1 like Supabase's API gateway, with permissive CORS. */
function startGateway() {
  const routes = [
    ['/auth/v1', PORTS.auth],
    ['/rest/v1', PORTS.rest],
    ['/storage/v1', PORTS.storage],
  ];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
    'access-control-expose-headers': 'content-range, content-profile, x-total-count',
  };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    const route = routes.find(
      ([prefix]) => req.url?.startsWith(prefix + '/') || req.url === prefix,
    );
    if (!route) {
      res.writeHead(404, cors);
      res.end('not found');
      return;
    }
    const [prefix, port] = route;
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port,
        method: req.method,
        path: req.url.slice(prefix.length) || '/',
        headers: { ...req.headers, host: `127.0.0.1:${port}` },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, ...cors });
        up.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      res.writeHead(502, cors);
      res.end(String(error));
    });
    req.pipe(upstream);
  });
  server.listen(PORTS.gateway, '127.0.0.1');
  return server;
}

async function start() {
  ensureBinaries();
  chmodSync(join(BIN, 'postgrest'), 0o755);
  const secrets = loadOrCreateSecrets();
  initDatabase();
  const children = [];
  const pg = startPostgres();
  children.push(pg);
  await waitFor(() => {
    run(join(PG_BIN, 'pg_isready'), ['-h', PG_DIR, '-p', String(PORTS.db)], { quiet: true });
    return true;
  }, 'postgres');
  psql(null, { file: join(ROOT, 'scripts/local-stack/init.sql') });

  const auth = startAuth(secrets);
  children.push(auth);
  auth.stderr.on('data', (c) => process.stderr.write(`[auth] ${c}`));
  await waitFor(async () => (await fetch(`http://127.0.0.1:${PORTS.auth}/health`)).ok, 'auth');

  ensureStorage();
  const storage = startStorage(secrets);
  children.push(storage);
  storage.stderr.on('data', (c) => process.stderr.write(`[storage] ${c}`));
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${PORTS.storage}/status`)).ok,
    'storage',
    60000,
  );
  psql(null, { file: join(ROOT, 'scripts/local-stack/storage-grants.sql') });

  applyMigrations();

  const rest = startRest(secrets);
  children.push(rest);
  rest.stderr.on('data', (c) => process.stderr.write(`[rest] ${c}`));
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${PORTS.rest}/`)).status < 500,
    'postgrest',
  );

  const gateway = startGateway();
  const env = {
    url: `http://127.0.0.1:${PORTS.gateway}`,
    anonKey: secrets.anonKey,
    serviceKey: secrets.serviceKey,
    jwtSecret: secrets.jwtSecret,
    dbUrl: `postgres://postgres@127.0.0.1:${PORTS.db}/postgres`,
  };
  writeFileSync(join(STATE, 'env.json'), JSON.stringify(env, null, 2));
  log(`ready: ${env.url} (details in .local-stack/env.json)`);

  const stop = () => {
    gateway.close();
    for (const child of children.reverse()) child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

function reset() {
  rmSync(PG_DIR, { recursive: true, force: true });
  rmSync(STORAGE_FILES, { recursive: true, force: true });
  rmSync(join(STATE, 'env.json'), { force: true });
  log('database wiped');
}

const command = process.argv[2] ?? 'start';
if (command === 'start') await start();
else if (command === 'reset') reset();
else if (command === 'migrate') applyMigrations();
else {
  console.error('usage: stack.mjs start|reset|migrate');
  process.exit(1);
}
