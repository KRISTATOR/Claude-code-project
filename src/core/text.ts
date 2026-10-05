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

/**
 * Case endings stripped by the light stemmer, longest first. They are matched
 * on folded text (no diacritics), so "Lipnově" and "Lipnov" share a stem.
 */
const SUFFIXES = [
  'atech',
  'atum',
  'etem',
  'ich',
  'ech',
  'eho',
  'emi',
  'emu',
  'ete',
  'eti',
  'iho',
  'imi',
  'imu',
  'ach',
  'ata',
  'aty',
  'ama',
  'ami',
  'ove',
  'ovi',
  'ymi',
  'em',
  'es',
  'ho',
  'im',
  'mi',
  'mu',
  'om',
  'os',
  'ou',
  'um',
  'us',
  'ym',
  'am',
  'ov',
  'a',
  'e',
  'i',
  'o',
  'u',
  'y',
];

/**
 * A light Czech stemmer for search: folds the word and strips one common case
 * ending, keeping at least three letters ("hraběnkami" -> "hrabenk",
 * "Lipnově" -> "lipn", "dům" -> "dum"). Good enough to match inflected forms;
 * not a linguistic analyser.
 */
export function stemCzech(word: string): string {
  const folded = fold(word);
  if (/\d/.test(folded)) return folded;
  for (const suffix of SUFFIXES) {
    if (folded.endsWith(suffix) && folded.length - suffix.length >= 3) {
      return folded.slice(0, -suffix.length);
    }
  }
  return folded;
}
