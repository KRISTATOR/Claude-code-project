import { randomUUID } from 'node:crypto';
import { open, readFile, type FileHandle } from 'node:fs/promises';
import { basename } from 'node:path';
import { dialog, type BrowserWindow } from 'electron';
import type { ArchiveListing } from '@shared/api';
import { MAX_FILE_BYTES } from '@core/files/names';
import {
  dataOffset,
  extract,
  findDirectory,
  parseCentralDirectory,
  parseZip64Eocd,
  TAIL_BYTES,
  ZipError,
  type ZipEntry,
} from '@core/files/zip';

/**
 * Zip archives the user picked (Google Drive downloads, Takeout parts,
 * Zázemí backups). The renderer never sees their paths: it gets a token and
 * entry numbers, and asks for one entry's bytes at a time.
 */
interface Opened {
  archives: { name: string; handle: FileHandle; entries: ZipEntry[] }[];
}

const opened = new Map<string, Opened>();

async function readAt(handle: FileHandle, position: number, length: number): Promise<Uint8Array> {
  const buffer = new Uint8Array(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

async function listEntries(handle: FileHandle): Promise<ZipEntry[]> {
  const { size } = await handle.stat();
  const tailStart = Math.max(0, size - TAIL_BYTES);
  let directory = findDirectory(await readAt(handle, tailStart, size - tailStart), size);
  if (directory.kind === 'zip64') {
    directory = parseZip64Eocd(await readAt(handle, directory.offset, 56));
  }
  return parseCentralDirectory(await readAt(handle, directory.offset, directory.size));
}

async function choosePaths(window: BrowserWindow | null): Promise<string[]> {
  // End-to-end tests name the files to open in a list file instead of
  // answering a dialog (one path per line; they can change it between steps).
  const listFile = __ZAZEMI_TEST_BUILD__ ? process.env['ZAZEMI_OPEN_FILES'] : undefined;
  if (listFile) {
    return (await readFile(listFile, 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  const options = {
    properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

export async function openArchives(window: BrowserWindow | null): Promise<ArchiveListing | null> {
  const paths = await choosePaths(window);
  if (paths.length === 0) return null;
  const archives: Opened['archives'] = [];
  try {
    for (const path of paths) {
      const handle = await open(path, 'r');
      try {
        archives.push({ name: basename(path), handle, entries: await listEntries(handle) });
      } catch (error) {
        await handle.close();
        throw error;
      }
    }
  } catch (error) {
    for (const archive of archives) await archive.handle.close();
    if (error instanceof ZipError) return { token: '', archives: [], error: 'not_zip' };
    throw error;
  }
  const token = randomUUID();
  opened.set(token, { archives });
  return {
    token,
    archives: archives.map((archive) => ({
      name: archive.name,
      entries: archive.entries.map((entry) => ({ path: entry.path, size: entry.size })),
    })),
  };
}

export async function readArchiveEntry(
  token: string,
  archiveIndex: number,
  entryIndex: number,
): Promise<Uint8Array> {
  const archive = opened.get(token)?.archives[archiveIndex];
  const entry = archive?.entries[entryIndex];
  if (!archive || !entry) throw new Error('unknown archive entry');
  if (entry.size > MAX_FILE_BYTES || entry.compressedSize > MAX_FILE_BYTES * 2) {
    throw new Error('entry too large');
  }
  const start = dataOffset(entry, await readAt(archive.handle, entry.offset, 30));
  return extract(entry, await readAt(archive.handle, start, entry.compressedSize));
}

export async function closeArchives(token: string): Promise<void> {
  const entry = opened.get(token);
  opened.delete(token);
  for (const archive of entry?.archives ?? []) await archive.handle.close();
}
