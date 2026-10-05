import { canonEntryKind, characterKind, propDocumentKind, readData } from '../kinds';
import { referencedNumbers } from '../print/documents';
import type { RecordRow } from '../model';
import { dataLinkNodes, fieldText } from '../richtext';
import { fold, stemCzech } from '../text';

/**
 * The consistency checker (docs/PLAN.md §1, point 9). It finds what can be
 * found mechanically: the same or confusingly similar names, `[[links]]` to
 * records that no longer exist, and facts that differ from the canon
 * registry. It does not understand prose.
 */
export type Finding =
  | { type: 'duplicate_name'; key: string; ids: [string, string]; name: string }
  | { type: 'similar_names'; key: string; ids: [string, string]; words: [string, string] }
  | {
      type: 'dangling_link';
      key: string;
      from_id: string;
      target_id: string;
      label: string;
      trashed: boolean;
    }
  | {
      type: 'canon_conflict';
      key: string;
      canon_id: string;
      subject_id: string;
      expected: string;
      actual: string;
    }
  | {
      type: 'canon_contradiction';
      key: string;
      ids: [string, string];
      subject: string;
      values: [string, string];
    }
  | { type: 'canon_missing_subject'; key: string; canon_id: string }
  | { type: 'missing_document'; key: string; from_id: string; number: string };

export type CheckedRecord = Pick<
  RecordRow,
  'id' | 'kind' | 'title' | 'data' | 'deleted_at' | 'created_at'
>;

/** Kinds whose titles are names that players and writers will use. */
export const NAMED_KINDS = new Set([
  'world',
  'game',
  'page',
  'character',
  'npc',
  'faction',
  'definition',
]);

const norm = (value: string) => fold(value).replace(/\s+/g, ' ').trim();

/** Optimal string alignment distance (Levenshtein with transpositions). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => d[i]?.[j] ?? 0;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, at(i - 2, j - 2) + 1);
      }
      const row = d[i];
      if (row) row[j] = value;
    }
  }
  return at(a.length, b.length);
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/** Two different name stems a reader could mix up ("lipnov" / "lipnic"). */
export function similarStems(a: string, b: string): boolean {
  if (a === b) return false;
  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  if (shorter < 4) return false;
  if (editDistance(a, b) <= (shorter >= 7 ? 2 : 1)) return true;
  const prefix = commonPrefix(a, b);
  return prefix >= 4 && prefix >= 0.6 * longer;
}

/** Capitalised words of 4+ letters: the proper names in a title. */
function nameWords(title: string): string[] {
  return title
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4 && /^\p{Lu}/u.test(word) && !/\d/.test(word));
}

export function checkConsistency(records: CheckedRecord[]): Finding[] {
  const findings: Finding[] = [];
  const live = records.filter((record) => record.deleted_at === null);
  const byId = new Map(records.map((record) => [record.id, record]));
  const liveIds = new Set(live.map((record) => record.id));
  const named = live.filter((record) => NAMED_KINDS.has(record.kind) && record.title.trim());

  // Same name twice.
  const byName = new Map<string, CheckedRecord>();
  for (const record of named) {
    const key = norm(record.title);
    const first = byName.get(key);
    if (first) {
      findings.push({
        type: 'duplicate_name',
        key: `duplicate:${[first.id, record.id].sort().join(':')}`,
        ids: [first.id, record.id],
        name: record.title,
      });
    } else {
      byName.set(key, record);
    }
  }

  // Confusingly similar names, word by word.
  const stems = new Map<string, { word: string; id: string }>();
  for (const record of named) {
    for (const word of nameWords(record.title)) {
      const stem = stemCzech(word);
      if (!stems.has(stem)) stems.set(stem, { word, id: record.id });
    }
  }
  const entries = [...stems.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [stemA, a] = entries[i] ?? ['', { word: '', id: '' }];
      const [stemB, b] = entries[j] ?? ['', { word: '', id: '' }];
      if (a.id === b.id || !similarStems(stemA, stemB)) continue;
      findings.push({
        type: 'similar_names',
        key: `similar:${stemA}:${stemB}`,
        ids: [a.id, b.id],
        words: [a.word, b.word],
      });
    }
  }

  // Links to records that are gone.
  for (const record of live) {
    for (const link of dataLinkNodes(record.data)) {
      if (liveIds.has(link.id)) continue;
      findings.push({
        type: 'dangling_link',
        key: `link:${record.id}:${link.id}`,
        from_id: record.id,
        target_id: link.id,
        label: link.label,
        trashed: byId.has(link.id),
      });
    }
  }

  // References to numbered documents that do not exist ("dopis č. 12").
  const numbers = new Set(
    live
      .filter((row) => row.kind === 'prop_document')
      .map((row) => readData(propDocumentKind, row).number.trim())
      .filter(Boolean),
  );
  for (const record of live) {
    const text = [record.title, ...Object.values(record.data).map(fieldText)].join('\n');
    for (const number of referencedNumbers(text)) {
      if (numbers.has(number)) continue;
      findings.push({
        type: 'missing_document',
        key: `doc:${record.id}:${number}`,
        from_id: record.id,
        number,
      });
    }
  }

  // Canon: each fact against its subject, and facts against each other.
  const facts = new Map<string, { id: string; value: string }>();
  // Oldest first, so "the earlier value" is stable however the list was sorted.
  const canonRecords = live
    .filter((row) => row.kind === 'canon_entry')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const record of canonRecords) {
    const canon = readData(canonEntryKind, record);
    const value = canon.value.trim();
    if (!value) continue;
    const subjectKey = canon.subject_id ?? norm(canon.subject_name);
    const factKey = `${subjectKey}|${canon.field}|${norm(canon.label)}`;
    const earlier = facts.get(factKey);
    if (earlier && norm(earlier.value) !== norm(value)) {
      findings.push({
        type: 'canon_contradiction',
        key: `canon2:${[earlier.id, record.id].sort().join(':')}`,
        ids: [earlier.id, record.id],
        subject: canon.subject_name || record.title,
        values: [earlier.value, value],
      });
    } else if (!earlier) {
      facts.set(factKey, { id: record.id, value });
    }

    if (!canon.subject_id) continue;
    const subject = byId.get(canon.subject_id);
    if (!subject || subject.deleted_at !== null) {
      findings.push({
        type: 'canon_missing_subject',
        key: `canon0:${record.id}`,
        canon_id: record.id,
      });
      continue;
    }
    let actual: string | null = null;
    if (canon.field === 'title') actual = subject.title;
    else if (subject.kind === 'character' && canon.field === 'house_number') {
      actual = readData(characterKind, subject).house_number;
    } else if (subject.kind === 'character' && canon.field === 'post') {
      actual = readData(characterKind, subject).post;
    }
    if (actual === null || !actual.trim() || norm(actual) === norm(value)) continue;
    findings.push({
      type: 'canon_conflict',
      key: `canon1:${record.id}:${norm(actual)}`,
      canon_id: record.id,
      subject_id: subject.id,
      expected: value,
      actual,
    });
  }
  return findings;
}
