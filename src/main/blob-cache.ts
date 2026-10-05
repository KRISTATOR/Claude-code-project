import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * Content-addressed copies of downloaded file versions (docs/PLAN.md §2.3), so
 * each version is downloaded once per computer (Supabase Free: 5 GB egress).
 */
const MAX_BYTES = 2 * 1000 * 1000 * 1000;
const SHA = /^[0-9a-f]{64}$/;

function dir(): string {
  return join(app.getPath('userData'), 'cache', 'blobs');
}

export function blobPath(sha: string): string {
  if (!SHA.test(sha)) throw new Error('invalid sha256');
  return join(dir(), sha);
}

export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function hasBlob(sha: string): Promise<boolean> {
  try {
    await stat(blobPath(sha));
    return true;
  } catch {
    return false;
  }
}

export async function getBlob(sha: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(blobPath(sha)));
  } catch {
    return null;
  }
}

/** Stores bytes under their hash; refuses bytes that do not match it. */
export async function putBlob(sha: string, data: Uint8Array): Promise<void> {
  if (sha256(data) !== sha) throw new Error('hash mismatch');
  await mkdir(dir(), { recursive: true });
  const temp = `${blobPath(sha)}.tmp-${process.pid}`;
  await writeFile(temp, data);
  await rename(temp, blobPath(sha));
  void pruneBlobs();
}

export async function blobUsage(): Promise<number> {
  try {
    const names = await readdir(dir());
    let total = 0;
    for (const name of names) total += (await stat(join(dir(), name))).size;
    return total;
  } catch {
    return 0;
  }
}

/** Least recently used first, until the cache is under its limit. */
async function pruneBlobs(): Promise<void> {
  try {
    const names = (await readdir(dir())).filter((name) => SHA.test(name));
    const entries = await Promise.all(
      names.map(async (name) => {
        const info = await stat(join(dir(), name));
        return { name, size: info.size, used: info.atimeMs };
      }),
    );
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries.sort((a, b) => a.used - b.used)) {
      if (total <= MAX_BYTES) break;
      await unlink(join(dir(), entry.name)).catch(() => undefined);
      total -= entry.size;
    }
  } catch {
    // The cache is an optimisation; failures are not fatal.
  }
}
