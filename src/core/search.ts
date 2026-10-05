import MiniSearch, { type Query, type SearchResult } from 'minisearch';
import { fold, stemCzech } from './text';

/**
 * Full-text search with Czech handled properly (docs/PLAN.md §2.8): case and
 * diacritics are ignored, words match by prefix ("Lipnov" finds "Lipnově"),
 * and longer words tolerate one typo. Words are also indexed by a light stem,
 * so inflected forms match ("hraběnkami" finds "hraběnka").
 */
export interface SearchDoc {
  id: string;
  kind: string;
  title: string;
  body: string;
}

export interface Hit {
  id: string;
  kind: string;
  title: string;
  score: number;
  /** A short piece of the body around the first match. */
  snippet: string;
}

const TOKEN = /[^\p{L}\p{N}]+/u;

export function tokenize(text: string): string[] {
  return text.split(TOKEN).filter((token) => token.length > 0);
}

export class SearchIndex {
  private readonly index = new MiniSearch<SearchDoc>({
    fields: ['title', 'body'],
    storeFields: ['kind', 'title', 'body'],
    tokenize,
    processTerm: (term) => {
      const folded = fold(term);
      const stem = stemCzech(term);
      return stem === folded ? folded : [folded, stem];
    },
    searchOptions: {
      boost: { title: 3 },
      prefix: true,
      fuzzy: (term) => (term.length >= 5 ? 1 : 0),
      combineWith: 'AND',
    },
  });

  addAll(docs: SearchDoc[]): void {
    this.index.addAll(docs);
  }

  replace(doc: SearchDoc): void {
    if (this.index.has(doc.id)) this.index.discard(doc.id);
    this.index.add(doc);
  }

  remove(id: string): void {
    if (this.index.has(id)) this.index.discard(id);
  }

  search(query: string, limit = 50): Hit[] {
    const words = tokenize(query);
    if (words.length === 0) return [];
    // Each word matches by its folded prefix (with a typo allowed) or exactly
    // by its stem, so "Lipnov" finds "Lipnově" but not "Lipnice".
    const query_: Query = {
      combineWith: 'AND',
      queries: words.map((word) => ({
        combineWith: 'OR',
        queries: [
          { queries: [word], processTerm: fold },
          { queries: [word], processTerm: stemCzech, prefix: false, fuzzy: false },
        ],
      })),
    };
    return this.index
      .search(query_)
      .slice(0, limit)
      .map((result: SearchResult) => ({
        id: result.id as string,
        kind: String(result['kind']),
        title: String(result['title']),
        score: result.score,
        snippet: snippet(String(result['body'] ?? ''), result.terms),
      }));
  }
}

/** ~160 characters around the first matching word. */
export function snippet(body: string, terms: string[]): string {
  if (!body) return '';
  const folded = fold(body);
  let position = -1;
  for (const term of terms) {
    const found = folded.indexOf(term);
    if (found >= 0 && (position < 0 || found < position)) position = found;
  }
  if (position < 0) return body.slice(0, 160).trim();
  const start = Math.max(0, position - 60);
  const end = Math.min(body.length, position + 100);
  return `${start > 0 ? '…' : ''}${body.slice(start, end).replace(/\s+/g, ' ').trim()}${end < body.length ? '…' : ''}`;
}
