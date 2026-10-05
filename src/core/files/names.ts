/** File names, types and what the app can do with each type. */

export type PreviewKind = 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'image' | 'text' | 'markdown' | 'none';
export type OfficeApp = 'word' | 'excel' | 'powerpoint' | null;

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

export function baseNameOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function mimeOf(name: string): string {
  return MIME[extensionOf(name)] ?? 'application/octet-stream';
}

export function previewKindOf(name: string): PreviewKind {
  const ext = extensionOf(name);
  if (ext === 'docx' || ext === 'dotx') return 'docx';
  if (ext === 'xlsx' || ext === 'xltx') return 'xlsx';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (ext === 'md') return 'markdown';
  if (['txt', 'csv', 'json', 'log'].includes(ext)) return 'text';
  return 'none';
}

export function officeAppOf(name: string): OfficeApp {
  const ext = extensionOf(name);
  if (['docx', 'doc', 'dotx', 'odt', 'rtf'].includes(ext)) return 'word';
  if (['xlsx', 'xls', 'xltx', 'ods', 'csv'].includes(ext)) return 'excel';
  if (['pptx', 'ppt', 'odp'].includes(ext)) return 'powerpoint';
  return null;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A name Windows accepts: no \ / : * ? " < > | or control characters, no
 * trailing dots or spaces, no reserved device names, at most 150 characters
 * (Office has trouble with long paths).
 */
export function sanitizeFileName(name: string): string {
  let clean = '';
  for (const char of name.normalize('NFC')) {
    clean += char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? '_' : char;
  }
  clean = clean
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (!clean || clean === '.' || clean === '..') clean = 'soubor';
  if (WINDOWS_RESERVED.test(baseNameOf(clean))) clean = `_${clean}`;
  if (clean.length > 150) {
    const ext = extensionOf(clean);
    const keep = 150 - (ext ? ext.length + 1 : 0);
    clean = clean.slice(0, keep).trimEnd() + (ext ? `.${ext}` : '');
  }
  return clean;
}

/** "Dopis.docx" → "Dopis (2).docx" when the name is taken (case-insensitive). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((item) => item.toLocaleLowerCase('cs')));
  if (!used.has(name.toLocaleLowerCase('cs'))) return name;
  const ext = extensionOf(name);
  const base = baseNameOf(name);
  for (let n = 2; ; n += 1) {
    const candidate = ext ? `${base} (${n}).${ext}` : `${base} (${n})`;
    if (!used.has(candidate.toLocaleLowerCase('cs'))) return candidate;
  }
}

/** Supabase Free tier: 50 MB per file (docs/PLAN.md §0). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
