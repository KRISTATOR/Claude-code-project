/** Lowercase and strip diacritics: "Lipnově" -> "lipnove". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** True if every word of `query` starts some word of `text` (diacritics-insensitive). */
export function matchesQuery(text: string, query: string): boolean {
  const words = fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const terms = fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return terms.every((term) => words.some((word) => word.startsWith(term)));
}

/** Locale-aware comparison for sorting Czech names ("Č" after "C", "ch" after "h"). */
export const compareCzech = new Intl.Collator('cs').compare;
