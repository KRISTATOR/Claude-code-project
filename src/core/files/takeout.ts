import { MAX_FILE_BYTES } from './names';

/**
 * Plans an import of Google Drive material (docs/PLAN.md §1, item 5): a
 * folder dragged in, a Drive "Download" zip, or Google Takeout archives in
 * one or more parts. Paths are normalized to the folder structure the
 * organizers know, Google-only items are skipped with a reason, and the
 * report lists everything that did not come in.
 */
export interface ImportSource {
  /** "/"-separated path as found in the archive or the dropped folder. */
  path: string;
  size: number;
  /** Opaque handle the caller uses to read the bytes. */
  ref: string;
}

export interface PlannedFile {
  ref: string;
  path: string;
  folders: string[];
  name: string;
  size: number;
}

export type SkipReason =
  'junk' | 'google_form' | 'google_link' | 'takeout_index' | 'too_large' | 'duplicate' | 'existing';

export interface Skipped {
  path: string;
  reason: SkipReason;
}

export interface ImportPlan {
  files: PlannedFile[];
  skipped: Skipped[];
}

/** Takeout wraps Drive in "Takeout/Disk Google/…" (the name depends on the account language). */
const TAKEOUT_ROOT = /^takeout$/i;
const DRIVE_ROOT = /^(drive|disk|disk google|google drive|můj disk|my drive)$/i;

/** Placeholders Google writes for things that have no file of their own. */
const FORM_STUB = /\.gform$/i;
const LINK_STUB =
  /\.(gdoc|gsheet|gslides|gdraw|gtable|gmap|gsite|gjam|gscript|glink|url|webloc|desktop)$/i;

export function isJunkName(name: string): boolean {
  return (
    name.startsWith('~$') ||
    name === 'Thumbs.db' ||
    name === 'desktop.ini' ||
    name === '.DS_Store' ||
    name.startsWith('._') ||
    name === '__MACOSX'
  );
}

/** Splits a path and strips Takeout's own wrapper folders. */
export function normalizePath(path: string): string[] {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length > 1 && TAKEOUT_ROOT.test(parts[0] ?? '')) {
    parts.shift();
    if (parts.length > 1 && DRIVE_ROOT.test(parts[0] ?? '')) parts.shift();
  }
  return parts;
}

/**
 * Google numbers files that share a name: "Dopis.docx", "Dopis(1).docx" or
 * "Dopis (1).docx". Returns the name without the number.
 */
export function withoutCopyNumber(name: string): string {
  return name.replace(/\s?\(\d+\)(?=(\.[^.]*)?$)/, '');
}

export function planImport(
  sources: readonly ImportSource[],
  options: { maxBytes?: number } = {},
): ImportPlan {
  const maxBytes = options.maxBytes ?? MAX_FILE_BYTES;
  const files: PlannedFile[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const parts = normalizePath(source.path);
    const name = parts.at(-1) ?? '';
    const skip = (reason: SkipReason) => skipped.push({ path: parts.join('/'), reason });
    if (source.path.endsWith('/') || parts.length === 0) continue;
    if (parts.some((part) => part === '__MACOSX') || isJunkName(name)) {
      skip('junk');
      continue;
    }
    if (parts.length === 1 && /^archive_browser\.html$/i.test(name)) {
      skip('takeout_index');
      continue;
    }
    if (FORM_STUB.test(name)) {
      skip('google_form');
      continue;
    }
    if (LINK_STUB.test(name)) {
      skip('google_link');
      continue;
    }
    if (source.size > maxBytes) {
      skip('too_large');
      continue;
    }
    // Multi-part archives occasionally repeat an entry.
    const key = `${parts.join('/')}:${String(source.size)}`;
    if (seen.has(key)) {
      skip('duplicate');
      continue;
    }
    seen.add(key);
    files.push({
      ref: source.ref,
      path: parts.join('/'),
      folders: parts.slice(0, -1),
      name,
      size: source.size,
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'cs'));
  return { files, skipped };
}

/** The top-level folders of a plan with their file counts, for the preview. */
export function planSummary(plan: ImportPlan): { folder: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const file of plan.files) {
    const top = file.folders[0] ?? '';
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([folder, count]) => ({ folder, files: count }))
    .sort((a, b) => a.folder.localeCompare(b.folder, 'cs'));
}

export interface ImportReport {
  imported: string[];
  skipped: Skipped[];
  failed: { path: string; message: string }[];
}

/** A plain-text report the organizers can keep (labels come from the UI). */
export function reportText(
  report: ImportReport,
  labels: {
    title: string;
    imported: string;
    skipped: string;
    failed: string;
    reasons: Record<SkipReason, string>;
  },
): string {
  const lines = [labels.title, ''];
  lines.push(`${labels.imported} (${String(report.imported.length)})`);
  for (const path of report.imported) lines.push(`  ${path}`);
  lines.push('', `${labels.skipped} (${String(report.skipped.length)})`);
  for (const item of report.skipped) lines.push(`  ${item.path} – ${labels.reasons[item.reason]}`);
  lines.push('', `${labels.failed} (${String(report.failed.length)})`);
  for (const item of report.failed) lines.push(`  ${item.path} – ${item.message}`);
  return `${lines.join('\r\n')}\r\n`;
}
