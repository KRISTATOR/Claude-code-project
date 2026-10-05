/**
 * "What changed since v1" for the rulebook: a word-level diff (Myers'
 * algorithm) and a section-by-section comparison of two versions.
 */
export interface DiffPart {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

/**
 * Words, runs of whitespace and single punctuation marks, so "dotek." and
 * "dotek. Zásah" share "dotek" and "."; joining the tokens restores the text.
 */
export function diffTokens(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

/** Shortest edit script between two token lists (Myers, O((N+M)·D)). */
export function diffLists(a: string[], b: string[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Array<number>(2 * max + 3).fill(0);
  const trace: number[][] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  // Walk back through the trace to recover the edits.
  const parts: DiffPart[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const vd = trace[d] ?? [];
    const k = x - y;
    const down = k === -d || (k !== d && (vd[offset + k - 1] ?? 0) < (vd[offset + k + 1] ?? 0));
    const prevK = down ? k + 1 : k - 1;
    const prevX = vd[offset + prevK] ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      parts.push({ type: 'equal', text: a[x - 1] ?? '' });
      x -= 1;
      y -= 1;
    }
    if (d > 0) {
      if (down) parts.push({ type: 'insert', text: b[y - 1] ?? '' });
      else parts.push({ type: 'delete', text: a[x - 1] ?? '' });
      x = prevX;
      y = prevY;
    }
  }
  parts.reverse();

  // Merge neighbours of the same type.
  const merged: DiffPart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && last.type === part.type) last.text += part.text;
    else merged.push({ ...part });
  }
  return merged;
}

export function diffWords(before: string, after: string): DiffPart[] {
  return diffLists(diffTokens(before), diffTokens(after));
}

export interface ComparableSection {
  id: string;
  title: string;
  text: string;
}

export type SectionChange =
  | { status: 'added'; id: string; title: string; text: string }
  | { status: 'removed'; id: string; title: string; text: string }
  | { status: 'changed'; id: string; title: string; oldTitle: string; diff: DiffPart[] }
  | { status: 'unchanged'; id: string; title: string };

/** Sections are matched by id, so a renamed section is "changed", not removed and added. */
export function compareSections(
  before: ComparableSection[],
  after: ComparableSection[],
): SectionChange[] {
  const old = new Map(before.map((section) => [section.id, section]));
  const changes: SectionChange[] = [];
  for (const section of after) {
    const previous = old.get(section.id);
    if (!previous) {
      changes.push({ status: 'added', id: section.id, title: section.title, text: section.text });
    } else if (previous.text === section.text && previous.title === section.title) {
      changes.push({ status: 'unchanged', id: section.id, title: section.title });
    } else {
      changes.push({
        status: 'changed',
        id: section.id,
        title: section.title,
        oldTitle: previous.title,
        diff: diffWords(previous.text, section.text),
      });
    }
    old.delete(section.id);
  }
  for (const section of old.values()) {
    changes.push({ status: 'removed', id: section.id, title: section.title, text: section.text });
  }
  return changes;
}
