import { inflateSync } from 'fflate';

/**
 * Just enough of the zip format to read Google Takeout and Drive downloads
 * entry by entry, without loading a multi-gigabyte archive into memory:
 * main reads the end of the file, then the central directory, then one
 * entry's bytes at a time. Zip64 is supported because Takeout parts can be
 * up to 50 GB.
 */
export interface ZipEntry {
  /** Path inside the archive, "/"-separated; folders end with "/". */
  path: string;
  method: number;
  compressedSize: number;
  size: number;
  /** Where the entry's local header starts. */
  offset: number;
}

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** How many bytes from the end of the file to read to find the directory. */
export const TAIL_BYTES = 22 + 0xffff + 20;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u64(data: DataView, at: number): number {
  return Number(data.getBigUint64(at, true));
}

export type Directory =
  | { kind: 'directory'; offset: number; size: number; count: number }
  /** Zip64: read 56 bytes at `offset` and pass them to parseZip64Eocd. */
  | { kind: 'zip64'; offset: number };

/** Finds the central directory from the last bytes of the file. */
export function findDirectory(tail: Uint8Array, fileSize: number): Directory {
  const data = view(tail);
  for (let at = tail.length - 22; at >= 0; at -= 1) {
    if (data.getUint32(at, true) !== EOCD) continue;
    const count = data.getUint16(at + 10, true);
    const size = data.getUint32(at + 12, true);
    const offset = data.getUint32(at + 16, true);
    const locator = at - 20;
    if (
      (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) &&
      locator >= 0 &&
      data.getUint32(locator, true) === ZIP64_LOCATOR
    ) {
      return { kind: 'zip64', offset: u64(data, locator + 8) };
    }
    if (offset + size > fileSize) throw new ZipError('damaged archive');
    return { kind: 'directory', offset, size, count };
  }
  throw new ZipError('not a zip archive');
}

export function parseZip64Eocd(bytes: Uint8Array): Extract<Directory, { kind: 'directory' }> {
  const data = view(bytes);
  if (data.getUint32(0, true) !== ZIP64_EOCD) throw new ZipError('damaged zip64 archive');
  return {
    kind: 'directory',
    count: u64(data, 32),
    size: u64(data, 40),
    offset: u64(data, 48),
  };
}

const utf8 = new TextDecoder('utf-8');

export function parseCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const data = view(bytes);
  const entries: ZipEntry[] = [];
  let at = 0;
  while (at + 46 <= bytes.length && data.getUint32(at, true) === CENTRAL) {
    const method = data.getUint16(at + 10, true);
    let compressedSize = data.getUint32(at + 20, true);
    let size = data.getUint32(at + 24, true);
    const nameLength = data.getUint16(at + 28, true);
    const extraLength = data.getUint16(at + 30, true);
    const commentLength = data.getUint16(at + 32, true);
    let offset = data.getUint32(at + 42, true);
    const path = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    // Zip64 extra field: 8-byte values for the fields that overflowed, in order.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = data.getUint16(extra, true);
      const length = data.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        if (size === 0xffffffff) {
          size = u64(data, field);
          field += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = u64(data, field);
          field += 8;
        }
        if (offset === 0xffffffff) offset = u64(data, field);
      }
      extra += 4 + length;
    }
    entries.push({ path: path.replace(/\\/g, '/'), method, compressedSize, size, offset });
    at = extraEnd + commentLength;
  }
  return entries;
}

/** Where an entry's data starts, given the 30 bytes of its local header. */
export function dataOffset(entry: ZipEntry, localHeader: Uint8Array): number {
  const data = view(localHeader);
  if (data.getUint32(0, true) !== LOCAL) throw new ZipError('damaged entry');
  return entry.offset + 30 + data.getUint16(26, true) + data.getUint16(28, true);
}

/** Unpacks an entry's bytes (stored or deflated). */
export function extract(entry: ZipEntry, compressed: Uint8Array): Uint8Array {
  if (entry.method === 0) return compressed;
  if (entry.method === 8) {
    const out = inflateSync(compressed, { out: new Uint8Array(entry.size) });
    if (out.length !== entry.size) throw new ZipError('damaged entry');
    return out;
  }
  throw new ZipError(`unsupported compression ${String(entry.method)}`);
}

/** Reads every entry of an archive held in memory (tests, small backups). */
export function readZip(bytes: Uint8Array): { entry: ZipEntry; data: () => Uint8Array }[] {
  const tail = bytes.subarray(Math.max(0, bytes.length - TAIL_BYTES));
  let directory = findDirectory(tail, bytes.length);
  if (directory.kind === 'zip64') {
    directory = parseZip64Eocd(bytes.subarray(directory.offset, directory.offset + 56));
  }
  const entries = parseCentralDirectory(
    bytes.subarray(directory.offset, directory.offset + directory.size),
  );
  return entries.map((entry) => ({
    entry,
    data: () => {
      const start = dataOffset(entry, bytes.subarray(entry.offset, entry.offset + 30));
      return extract(entry, bytes.subarray(start, start + entry.compressedSize));
    },
  }));
}
