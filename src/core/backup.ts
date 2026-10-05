/**
 * The organizer "Záloha" export (docs/PLAN.md §2.12). A plain JSON document so
 * it stays readable without the app. Registrations and other personal data
 * (M6) are excluded unless explicitly requested.
 */
export const BACKUP_FORMAT = 'zazemi-backup';
export const BACKUP_VERSION = 1;

export interface BackupInput {
  appVersion: string;
  exportedAt: Date;
  team: { id: string; name: string };
  tables: Record<string, readonly unknown[]>;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  app_version: string;
  exported_at: string;
  team: { id: string; name: string };
  counts: Record<string, number>;
  tables: Record<string, readonly unknown[]>;
}

export function buildBackup(input: BackupInput): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app_version: input.appVersion,
    exported_at: input.exportedAt.toISOString(),
    team: input.team,
    counts: Object.fromEntries(
      Object.entries(input.tables).map(([name, rows]) => [name, rows.length]),
    ),
    tables: input.tables,
  };
}

/** "zazemi-zaloha-chynicky-larp-2026-10-05.json" */
export function backupFileName(teamName: string, date: Date, extension = 'json'): string {
  const slug =
    teamName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tym';
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `zazemi-zaloha-${slug}-${day}.${extension}`;
}
