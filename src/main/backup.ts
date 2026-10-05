import { randomUUID } from 'node:crypto';
import { createWriteStream, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { dialog, type BrowserWindow } from 'electron';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

/**
 * Streams the "Záloha" export into a .zip on disk, entry by entry, so large
 * drives never have to fit in memory.
 */
interface Job {
  zip: Zip;
  out: WriteStream;
  path: string;
  done: Promise<void>;
}

const jobs = new Map<string, Job>();

async function chooseTarget(
  window: BrowserWindow | null,
  defaultName: string,
): Promise<string | null> {
  // End-to-end tests save into a known folder instead of answering a dialog.
  const testDir = __ZAZEMI_TEST_BUILD__ ? process.env['ZAZEMI_SAVE_DIR'] : undefined;
  if (testDir) return join(testDir, defaultName);
  const options = { defaultPath: defaultName, filters: [{ name: 'ZIP', extensions: ['zip'] }] };
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

export async function beginBackup(
  window: BrowserWindow | null,
  defaultName: string,
): Promise<string | null> {
  const filePath = await chooseTarget(window, defaultName);
  if (!filePath) return null;
  const out = createWriteStream(filePath);
  let resolveDone: () => void = () => undefined;
  let rejectDone: (error: unknown) => void = () => undefined;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      rejectDone(error);
      return;
    }
    out.write(chunk);
    if (final) out.end(() => resolveDone());
  });
  const token = randomUUID();
  jobs.set(token, { zip, out, path: filePath, done });
  return token;
}

/** Entry names are relative paths without "..": checked by the IPC schema. */
export function addToBackup(token: string, entryPath: string, data: Uint8Array): void {
  const job = jobs.get(token);
  if (!job) throw new Error('unknown backup');
  // Office files and images are already compressed; store them as they are.
  const compress = /\.(json|txt|md|csv|xml|svg)$/i.test(entryPath);
  const entry = compress ? new ZipDeflate(entryPath, { level: 6 }) : new ZipPassThrough(entryPath);
  job.zip.add(entry);
  entry.push(data, true);
}

export async function finishBackup(token: string): Promise<string> {
  const job = jobs.get(token);
  if (!job) throw new Error('unknown backup');
  jobs.delete(token);
  job.zip.end();
  await job.done;
  return job.path;
}

export function abortBackup(token: string): void {
  const job = jobs.get(token);
  if (!job) return;
  jobs.delete(token);
  job.zip.terminate();
  job.out.destroy();
}
