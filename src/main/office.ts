import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, join } from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { app, BrowserWindow, shell } from 'electron';
import { z } from 'zod';
import { isOfficeLockFile } from '@core/files/office';
import { sanitizeFileName } from '@core/files/names';
import type { FinishResult, OfficeEvent, OfficeSessionInfo, OpenResult } from '@shared/api';
import { IPC } from '@shared/channels';
import { blobPath, sha256 } from './blob-cache';

/**
 * Opening files in the desktop Office apps with check-out/check-in
 * (docs/PLAN.md §2.6). Main owns the working folders and watches them; the
 * renderer owns locks and uploads. Sessions survive restarts and crashes.
 */
const NO_LOCK_AFTER_MS = 30_000;

const sessionSchema = z.object({
  fileId: z.string(),
  sessionId: z.string(),
  name: z.string(),
  dir: z.string(),
  baseSha: z.string(),
  lastSha: z.string(),
});
type Session = z.infer<typeof sessionSchema>;

interface Live {
  watcher: FSWatcher;
  lockSeen: boolean;
  lockPresent: boolean;
  emittedSha: string;
  noLockTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, Session>();
const live = new Map<string, Live>();

function workRoot(): string {
  if (__ZAZEMI_TEST_BUILD__) return join(app.getPath('userData'), 'work');
  const local = process.env['LOCALAPPDATA'];
  return local ? join(local, 'Zazemi') : join(app.getPath('userData'), 'work');
}

function stateFile(): string {
  return join(app.getPath('userData'), 'office-sessions.json');
}

async function persist(): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(stateFile(), JSON.stringify([...sessions.values()], null, 2));
}

function emit(event: OfficeEvent): void {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send(IPC.officeEvent, event);
}

async function fileSha(path: string): Promise<string | null> {
  try {
    return sha256(new Uint8Array(await readFile(path)));
  } catch {
    return null;
  }
}

async function open(path: string, mode: 'edit' | 'view'): Promise<OpenResult> {
  const fake = __ZAZEMI_TEST_BUILD__ ? process.env['ZAZEMI_FAKE_OFFICE'] : undefined;
  if (fake) {
    void fakeOffice(path, mode, fake);
    return { ok: true };
  }
  const error = await shell.openPath(path);
  return error ? { ok: false, error: 'no-app', message: error } : { ok: true };
}

/**
 * Test builds only: pretend to be Word. "edit" creates a lock file, saves a
 * change and closes; "keep-open" saves but stays open.
 */
async function fakeOffice(path: string, mode: 'edit' | 'view', script: string): Promise<void> {
  const dir = join(path, '..');
  await appendFile(join(dir, '..', 'fake-office.log'), `${mode} ${basename(path)}\n`);
  if (mode === 'view') return;
  const lock = join(dir, `~$${basename(path).slice(2)}`);
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(300);
  await writeFile(lock, 'owner');
  await wait(500);
  await appendFile(path, '\n[upraveno ve Wordu]');
  if (script === 'keep-open') return;
  await wait(2500);
  await rm(lock, { force: true });
}

function startWatching(session: Session): void {
  stopWatching(session.fileId);
  const target = join(session.dir, session.name);
  const watcher = watch(session.dir, {
    depth: 0,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 200 },
  });
  const state: Live = {
    watcher,
    lockSeen: false,
    lockPresent: false,
    emittedSha: session.lastSha,
    noLockTimer: null,
  };
  live.set(session.fileId, state);

  const check = async () => {
    const sha = await fileSha(target);
    if (!sha || sha === state.emittedSha || sha === session.lastSha) return;
    state.emittedSha = sha;
    emit({ type: 'saved', fileId: session.fileId, sessionId: session.sessionId, sha });
  };

  watcher.on('all', (event, changed) => {
    const name = basename(changed);
    if (isOfficeLockFile(name)) {
      if (event === 'add' || event === 'change') {
        state.lockSeen = true;
        state.lockPresent = true;
      } else if (event === 'unlink') {
        state.lockPresent = false;
        // Give Office a moment to finish its last write before checking in.
        setTimeout(() => {
          void check().then(() => {
            if (!state.lockPresent) emit({ type: 'closed', fileId: session.fileId });
          });
        }, 1500);
      }
      return;
    }
    if (name === session.name && (event === 'add' || event === 'change')) void check();
  });

  state.noLockTimer = setTimeout(() => {
    if (!state.lockSeen) emit({ type: 'no-lock', fileId: session.fileId });
  }, NO_LOCK_AFTER_MS);
}

function stopWatching(fileId: string): void {
  const state = live.get(fileId);
  if (!state) return;
  if (state.noLockTimer) clearTimeout(state.noLockTimer);
  void state.watcher.close();
  live.delete(fileId);
}

/** Reloads sessions left by a previous run (crash, restart) and resumes watching. */
export async function restoreOfficeSessions(): Promise<void> {
  try {
    const parsed = z
      .array(sessionSchema)
      .safeParse(JSON.parse(await readFile(stateFile(), 'utf8')));
    if (!parsed.success) return;
    for (const session of parsed.data) {
      sessions.set(session.fileId, session);
      startWatching(session);
    }
  } catch {
    // No sessions yet.
  }
}

export async function openForEdit(input: {
  fileId: string;
  sessionId: string;
  name: string;
  sha: string;
}): Promise<OpenResult> {
  const name = sanitizeFileName(input.name);
  const existing = sessions.get(input.fileId);
  if (existing && existing.sessionId === input.sessionId) {
    return open(join(existing.dir, existing.name), 'edit');
  }
  const dir = join(workRoot(), 'w', `${input.fileId.slice(0, 8)}-${input.sessionId.slice(0, 4)}`);
  const target = join(dir, name);
  try {
    await mkdir(dir, { recursive: true });
    await chmod(target, 0o644).catch(() => undefined);
    await copyFile(blobPath(input.sha), target);
    await chmod(target, 0o644);
  } catch (error) {
    return { ok: false, error: 'io', message: String(error) };
  }
  const session: Session = {
    fileId: input.fileId,
    sessionId: input.sessionId,
    name,
    dir,
    baseSha: input.sha,
    lastSha: input.sha,
  };
  sessions.set(input.fileId, session);
  await persist();
  startWatching(session);
  return open(target, 'edit');
}

export async function openReadOnly(input: {
  fileId: string;
  name: string;
  sha: string;
}): Promise<OpenResult> {
  const name = sanitizeFileName(input.name);
  const dir = join(workRoot(), 'r', `${input.fileId.slice(0, 8)}-${input.sha.slice(0, 8)}`);
  const target = join(dir, name);
  try {
    await mkdir(dir, { recursive: true });
    const exists = await stat(target).then(
      () => true,
      () => false,
    );
    if (!exists) {
      await copyFile(blobPath(input.sha), target);
      await chmod(target, 0o444);
    }
  } catch (error) {
    return { ok: false, error: 'io', message: String(error) };
  }
  return open(target, 'view');
}

/** The uploaded state of a session: further saves are compared to this. */
export async function markUploaded(fileId: string, sha: string): Promise<void> {
  const session = sessions.get(fileId);
  if (!session) return;
  session.lastSha = sha;
  await persist();
}

export async function readWorking(
  fileId: string,
): Promise<{ data: Uint8Array; sha: string } | null> {
  const session = sessions.get(fileId);
  if (!session) return null;
  try {
    const data = new Uint8Array(await readFile(join(session.dir, session.name)));
    return { data, sha: sha256(data) };
  } catch {
    return null;
  }
}

/** Stops watching and reports whether there are unsaved-to-server changes. */
export async function finish(fileId: string): Promise<FinishResult> {
  stopWatching(fileId);
  const session = sessions.get(fileId);
  if (!session) return { changed: false };
  const working = await readWorking(fileId);
  if (!working || working.sha === session.lastSha) return { changed: false };
  return { changed: true, sha: working.sha };
}

/** Ends a session: the local copy becomes read-only and is forgotten. */
export async function discard(fileId: string): Promise<void> {
  stopWatching(fileId);
  const session = sessions.get(fileId);
  if (!session) return;
  sessions.delete(fileId);
  await persist();
  await chmod(join(session.dir, session.name), 0o444).catch(() => undefined);
}

export async function listSessions(): Promise<OfficeSessionInfo[]> {
  const result: OfficeSessionInfo[] = [];
  for (const session of sessions.values()) {
    const sha = await fileSha(join(session.dir, session.name));
    const state = live.get(session.fileId);
    result.push({
      fileId: session.fileId,
      sessionId: session.sessionId,
      name: session.name,
      pendingChange: sha !== null && sha !== session.lastSha,
      watching: state !== undefined,
      lockPresent: state?.lockPresent ?? false,
    });
  }
  return result;
}
