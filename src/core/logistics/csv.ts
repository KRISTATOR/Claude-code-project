/**
 * A small RFC 4180 CSV reader for Google Forms and Excel exports: quoted
 * fields with doubled quotes and line breaks, CRLF or LF, a UTF-8 BOM, and a
 * comma, semicolon or tab delimiter (Czech Excel saves with semicolons).
 */
export function detectDelimiter(text: string): string {
  // Look at the header line only, outside quotes.
  const counts = new Map<string, number>([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ]);
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = ',';
  let bestCount = 0;
  for (const [delimiter, count] of counts) {
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i] ?? '';
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += char;
      }
      i++;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += char;
    }
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines (a trailing newline, empty rows Excel adds).
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/** A parsed table: the first row as headers, the rest padded to the same width. */
export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export function csvTable(input: string): CsvTable {
  const [headers = [], ...rows] = parseCsv(input);
  const width = headers.length;
  return {
    headers: headers.map((header) => header.trim()),
    rows: rows.map((row) => Array.from({ length: width }, (_, index) => (row[index] ?? '').trim())),
  };
}
