import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';

/**
 * Small secrets (the Supabase session) encrypted with the operating system:
 * DPAPI on Windows. Where the OS offers no encryption (some Linux setups, CI),
 * values are stored unencrypted inside the app's own data folder.
 */
function dir(): string {
  return join(app.getPath('userData'), 'secure');
}

function fileFor(key: string): string {
  // Keys are validated by secureKeyInput (no path characters).
  return join(dir(), `${key}.bin`);
}

export async function secureGet(key: string): Promise<string | null> {
  try {
    const raw = await readFile(fileFor(key));
    if (raw[0] === 0x45 /* 'E' */) return safeStorage.decryptString(raw.subarray(1));
    return raw.subarray(1).toString('utf8');
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  await mkdir(dir(), { recursive: true });
  const payload = safeStorage.isEncryptionAvailable()
    ? Buffer.concat([Buffer.from('E'), safeStorage.encryptString(value)])
    : Buffer.concat([Buffer.from('P'), Buffer.from(value, 'utf8')]);
  await writeFile(fileFor(key), payload);
}

export async function secureRemove(key: string): Promise<void> {
  await rm(fileFor(key), { force: true });
}
