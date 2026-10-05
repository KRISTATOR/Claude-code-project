/**
 * Bulk NPC entry, one per line: "Name; rank" (also tab or " – " separated).
 * "Voják {1-10}; vojín" expands to Voják 1 … Voják 10 (at most 200 lines).
 */
export interface BulkNpc {
  name: string;
  rank: string;
}

const RANGE = /\{(\d{1,3})\s*-\s*(\d{1,3})\}/;
const MAX = 200;

export function parseBulkNpcs(text: string): BulkNpc[] {
  const result: BulkNpc[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [namePart = '', rankPart = ''] = line
      .split(/\t|;|\s[–—-]\s/, 2)
      .map((part) => part.trim());
    if (!namePart) continue;
    const range = RANGE.exec(namePart);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      const [low, high] = from <= to ? [from, to] : [to, from];
      for (let n = low; n <= high && result.length < MAX; n += 1) {
        result.push({
          name: namePart.replace(RANGE, String(n)).replace(/\s+/g, ' ').trim(),
          rank: rankPart,
        });
      }
    } else if (result.length < MAX) {
      result.push({ name: namePart, rank: rankPart });
    }
  }
  return result;
}
