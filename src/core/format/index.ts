/**
 * Czech formatting and parsing. All dates, numbers and money in the UI go
 * through these helpers (CLAUDE.md, code conventions).
 */

export const LOCALE = 'cs-CZ';
const NBSP = '\u00a0';

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

/** Formats an amount of real money in Czech crowns, e.g. "1 234,50 Kč". */
export function formatCzk(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** "5. 10. 2026" */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'numeric', year: 'numeric' })
    .format(date)
    .replace(/\u202f/g, ' ');
}

/** "14:32" */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** "5. 10. 2026 14:32" */
export function formatDateTime(date: Date): string {
  const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${formatDate(date)} ${time}`;
}

/** Formats a byte count, e.g. "20,4 MB". Uses decimal units like Supabase's quotas. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (Math.abs(value) >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${formatNumber(value, unit === 0 ? 0 : 1)}${NBSP}${units[unit] ?? 'B'}`;
}

/**
 * Parses a number typed by a Czech user. Accepts a decimal comma ("1,5"), a
 * decimal point ("1.5"), spaces or non-breaking spaces as thousands separators
 * ("1 234,5") and a leading minus. Returns `null` for anything else.
 */
export function parseNumber(input: string): number | null {
  const compact = input
    .trim()
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace('\u2212', '-');
  if (compact === '') return null;
  if (!/^-?(\d+([.,]\d+)?|[.,]\d+)$/.test(compact)) return null;
  const value = Number(compact.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}
