import type { Allergen, Diet } from '../kinds';
import type { PersonRow, RegistrationRow } from '../model';
import { fold } from '../text';
import type { CsvTable } from './csv';

/**
 * Importing registrations from a Google Forms CSV. Only the minimal fields
 * are kept (CLAUDE.md: personal data); e-mails, phone numbers of the player
 * themselves, addresses and timestamps are never read.
 */
export const registrationFields = ['name', 'age', 'allergies', 'emergency', 'note'] as const;
export type RegistrationField = (typeof registrationFields)[number];
export type ColumnMapping = Partial<Record<RegistrationField, number>>;

const PATTERNS: Record<RegistrationField, RegExp> = {
  name: /(jmeno|prijmeni|prezdivk|\bname\b)/,
  age: /(vek|narozen|nar\.|plnolet|nezletil|\b18\b|\bage\b|birth)/,
  allergies: /(alergi|dieta|stravov|omezeni.*jid|jidl|\bdiet|allerg)/,
  emergency: /(nouz|nehod|zakonn|rodic|emergency|\bice\b)/,
  note: /(poznamk|vzkaz|neco dalsiho|\bnote|comment)/,
};

/** Guesses which column holds which field from the Google Forms headers. */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<number>();
  // Emergency before name: "Jméno a telefon rodiče" is an emergency contact.
  for (const field of ['emergency', 'allergies', 'age', 'name', 'note'] as const) {
    const index = headers.findIndex(
      (header, i) => !taken.has(i) && PATTERNS[field].test(fold(header)),
    );
    if (index >= 0) {
      mapping[field] = index;
      taken.add(index);
    }
  }
  return mapping;
}

function parseDate(value: string): Date | null {
  const text = value.trim();
  let match = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(text);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (match) return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  return null;
}

function ageAt(birth: Date, at: Date): number {
  let age = at.getFullYear() - birth.getFullYear();
  const before =
    at.getMonth() < birth.getMonth() ||
    (at.getMonth() === birth.getMonth() && at.getDate() < birth.getDate());
  if (before) age -= 1;
  return age;
}

/**
 * Whether the answer means "under 18" at the game: an age, a birth date, or
 * yes/no to a question like "Je ti 18?" or "Jsi nezletilý?". null = unknown.
 */
export function minorFrom(value: string, header: string, at: Date): boolean | null {
  const text = fold(value.trim());
  if (!text) return null;
  const birth = parseDate(value);
  if (birth) return ageAt(birth, at) < 18;
  if (/^\d{1,3}$/.test(text)) return Number(text) < 18;
  const yes = /^(ano|yes|a|y)\b/.test(text);
  const no = /^(ne|no|n)\b/.test(text);
  if (!yes && !no) return null;
  const askingMinor = /nezletil|mladsi|under/.test(fold(header));
  return askingMinor ? yes : no;
}

const KEYWORDS: [Allergen | Diet, RegExp][] = [
  ['gluten', /(lepek|lepku|gluten|celiak)/],
  ['crustaceans', /(korys|krevet|krab|humr)/],
  ['eggs', /(vejce|vajec|vajic)/],
  ['fish', /(ryb|fish)/],
  ['peanuts', /(arasid|burak|peanut)/],
  ['soy', /(soj|soy)/],
  ['milk', /(mlek|mlec|laktoz|lactos|dairy)/],
  ['nuts', /(orech|orisk|mandl|nuts)/],
  ['celery', /celer/],
  ['mustard', /(horcic|mustard)/],
  ['sesame', /sezam/],
  ['sulphites', /(siricitan|sulfit|sulphit)/],
  ['lupin', /(lupin|vlci bob)/],
  ['molluscs', /(mekkys|slavk|chobotnic|mollus)/],
  ['vegan', /vegan/],
  ['vegetarian', /(vegetar|bezmas)/],
];

/** "ne", "nic", "žádné", "-": the answer means no allergies at all. */
function isNone(text: string): boolean {
  const folded = fold(text.trim());
  return folded === '' || /^(ne|nic|zadne|nemam|no|none|-)\.?$/.test(folded);
}

/** Recognizes allergens and diets in a free-text answer ("bez lepku, vegetarián"). */
export function allergensFrom(text: string): string[] {
  if (isNone(text)) return [];
  const folded = fold(text);
  const found = KEYWORDS.filter(([, pattern]) => pattern.test(folded)).map(([code]) => code);
  // "vegan" implies the vegetarian check too; keep just the stricter one.
  return found.includes('vegan') ? found.filter((code) => code !== 'vegetarian') : found;
}

export interface RegistrationDraft {
  name: string;
  person_id: string | null;
  is_minor: boolean;
  allergens: string[];
  allergies: string;
  emergency_contact: string;
  note: string;
}

export interface ImportResult {
  drafts: RegistrationDraft[];
  /** Rows not imported, 1-based as in the spreadsheet (header = row 1). */
  skipped: { row: number; reason: 'empty' | 'existing' }[];
  /** Rows that replaced an earlier answer of the same person in the file. */
  replaced: number;
}

/**
 * Turns CSV rows into registration drafts. People are matched to the roster
 * by name; existing registrations of the game are left alone; when someone
 * answered twice, the later answer wins (Google Forms appends).
 */
export function importRegistrations(
  table: CsvTable,
  mapping: ColumnMapping,
  context: {
    people: readonly Pick<PersonRow, 'id' | 'display_name'>[];
    existing: readonly Pick<RegistrationRow, 'name' | 'person_id'>[];
    /** The first day of the game, for ages from birth dates. */
    at: Date;
  },
): ImportResult {
  const cell = (row: readonly string[], field: RegistrationField) => {
    const index = mapping[field];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };
  const ageHeader = mapping.age === undefined ? '' : (table.headers[mapping.age] ?? '');
  const existingNames = new Set(context.existing.map((row) => fold(row.name.trim())));
  const existingPeople = new Set(context.existing.map((row) => row.person_id).filter(Boolean));
  const byName = new Map<string, RegistrationDraft>();
  const skipped: ImportResult['skipped'] = [];
  let replaced = 0;

  table.rows.forEach((row, index) => {
    const name = cell(row, 'name').replace(/\s+/g, ' ');
    const key = fold(name);
    if (!name) {
      skipped.push({ row: index + 2, reason: 'empty' });
      return;
    }
    const person = context.people.find((p) => fold(p.display_name.trim()) === key) ?? null;
    if (existingNames.has(key) || (person && existingPeople.has(person.id))) {
      skipped.push({ row: index + 2, reason: 'existing' });
      return;
    }
    const allergies = cell(row, 'allergies');
    if (byName.has(key)) replaced += 1;
    byName.set(key, {
      name: name.slice(0, 200),
      person_id: person?.id ?? null,
      is_minor: minorFrom(cell(row, 'age'), ageHeader, context.at) ?? false,
      allergens: allergensFrom(allergies),
      allergies: isNone(allergies) ? '' : allergies.slice(0, 2000),
      emergency_contact: cell(row, 'emergency').slice(0, 500),
      note: cell(row, 'note').slice(0, 4000),
    });
  });
  return { drafts: [...byName.values()], skipped, replaced };
}
