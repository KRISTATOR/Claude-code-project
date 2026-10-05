import { phaseKind, propDocumentKind, readData } from '../kinds';
import type { RecordRow } from '../model';

/** Numbers compare naturally: 2 < 10 < 10a < 11. */
export function compareNumbers(a: string, b: string): number {
  return a.localeCompare(b, 'cs', { numeric: true, sensitivity: 'base' });
}

/** The next free document number in a game ("13" after 12 and "12a"). */
export function nextNumber(documents: RecordRow[]): string {
  const numbers = documents
    .map((row) => Number.parseInt(readData(propDocumentKind, row).number, 10))
    .filter((value) => Number.isFinite(value));
  return String(Math.max(0, ...numbers) + 1);
}

/** Documents that share a number (should be unique within a game). */
export function duplicateNumbers(documents: RecordRow[]): Map<string, string[]> {
  const byNumber = new Map<string, string[]>();
  for (const row of documents) {
    const number = readData(propDocumentKind, row).number.trim();
    if (!number) continue;
    byNumber.set(number, [...(byNumber.get(number) ?? []), row.id]);
  }
  return new Map([...byNumber].filter(([, list]) => list.length > 1));
}

/**
 * Delivery order: by phase (its order), then delivery order, then number.
 * Documents without a phase come last.
 */
export function sortForDelivery(documents: RecordRow[], phases: RecordRow[]): RecordRow[] {
  const phaseOrder = new Map(phases.map((row) => [row.id, readData(phaseKind, row).order]));
  const key = (row: RecordRow) => {
    const data = readData(propDocumentKind, row);
    return {
      phase: data.phase_id ? (phaseOrder.get(data.phase_id) ?? 9999) : 10000,
      order: data.delivery_order,
      number: data.number,
    };
  };
  return [...documents].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return x.phase - y.phase || x.order - y.order || compareNumbers(x.number, y.number);
  });
}

/** "Everything for phase III" or "everything for this character's player". */
export function selectDocuments(
  documents: RecordRow[],
  filter: { phaseId?: string | null; characterId?: string | null },
): RecordRow[] {
  return documents.filter((row) => {
    const data = readData(propDocumentKind, row);
    if (filter.phaseId && data.phase_id !== filter.phaseId) return false;
    if (filter.characterId && !data.character_ids.includes(filter.characterId)) return false;
    return true;
  });
}

/**
 * Numbers a text refers to: "dopis č. 12", "dokument č. 7a", "vyhláška
 * číslo 3". Used by the consistency checker.
 */
export function referencedNumbers(text: string): string[] {
  const pattern =
    /\b(?:dopis|dokument|list|vyhlášk|naříz|provolán|oznámen|formulář)\p{L}*\s+(?:č\.|čís\.|číslo)\s*(\d+[a-z]?)/giu;
  const found: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const number = match[1];
    if (number && !found.includes(number)) found.push(number);
  }
  return found;
}
