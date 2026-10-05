import { archivePartKind, readData } from '../kinds';
import type { RecordRow } from '../model';

/**
 * Archive builder (docs/PLAN.md M4): parts in shelf-mark order get page
 * numbers. Parts already printed keep their pages; new parts (a supplement)
 * continue after the last printed page, so nothing printed is renumbered.
 */
export function roman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return String(value);
  const table: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rest = value;
  let result = '';
  for (const [amount, letters] of table) {
    while (rest >= amount) {
      result += letters;
      rest -= amount;
    }
  }
  return result;
}

export function shelfMark(section: number, item: number): string {
  return `${roman(section)}/${item}`;
}

export interface PlacedPart {
  id: string;
  shelfMark: string;
  section: number;
  item: number;
  firstPage: number;
  lastPage: number;
  /** Printed before (its pages are frozen). */
  printed: boolean;
}

/** Parts sorted by shelf mark (section, then item). */
export function sortParts(parts: RecordRow[]): RecordRow[] {
  return [...parts].sort((a, b) => {
    const x = readData(archivePartKind, a);
    const y = readData(archivePartKind, b);
    // A printed part comes first if two parts share a shelf mark.
    return x.section - y.section || x.item - y.item || (x.printed ? 0 : 1) - (y.printed ? 0 : 1);
  });
}

/**
 * Page ranges for all parts. `pageCounts` gives the number of pages of each
 * part not printed yet (measured from its PDF).
 */
export function placeParts(parts: RecordRow[], pageCounts: Map<string, number>): PlacedPart[] {
  const sorted = sortParts(parts);
  let next =
    Math.max(0, ...sorted.map((part) => readData(archivePartKind, part).printed?.last_page ?? 0)) +
    1;
  return sorted.map((part) => {
    const data = readData(archivePartKind, part);
    const mark = shelfMark(data.section, data.item);
    if (data.printed) {
      return {
        id: part.id,
        shelfMark: mark,
        section: data.section,
        item: data.item,
        firstPage: data.printed.first_page,
        lastPage: data.printed.last_page,
        printed: true,
      };
    }
    const count = Math.max(1, pageCounts.get(part.id) ?? 1);
    const placed = {
      id: part.id,
      shelfMark: mark,
      section: data.section,
      item: data.item,
      firstPage: next,
      lastPage: next + count - 1,
      printed: false,
    };
    next += count;
    return placed;
  });
}

/** The next free item number in a section. */
export function nextItem(parts: RecordRow[], section: number): number {
  return (
    Math.max(
      0,
      ...parts
        .map((part) => readData(archivePartKind, part))
        .filter((data) => data.section === section)
        .map((data) => data.item),
    ) + 1
  );
}

export function pageRange(part: Pick<PlacedPart, 'firstPage' | 'lastPage'>): string {
  return part.firstPage === part.lastPage
    ? String(part.firstPage)
    : `${part.firstPage}–${part.lastPage}`;
}
