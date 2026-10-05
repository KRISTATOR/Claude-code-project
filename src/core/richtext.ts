import { z } from 'zod';

/**
 * Rich text is stored as TipTap/ProseMirror JSON in a record's `data`. A
 * `[[link]]` to another record is a `wikiLink` node with the target's id; the
 * database trigger `private.sync_record_links` reads the same nodes to keep
 * backlinks (docs/PLAN.md §3.1). Nothing here depends on TipTap itself.
 */
export const WIKI_LINK = 'wikiLink';

export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export type RichDoc = RichNode & { type: 'doc' };

export function emptyDoc(): RichDoc {
  return { type: 'doc', content: [] };
}

/**
 * Only the top level is checked: the editor tolerates unknown nodes, and the
 * walkers below skip anything that is not an object.
 */
const doc = z.custom<RichDoc>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'doc' &&
    Array.isArray((value as { content?: unknown }).content ?? []),
);

/** A rich-text field: plain strings (older data, imports) become paragraphs. */
export const richDoc = z
  .union([z.string().transform((text) => textToDoc(text)), doc])
  .catch(() => emptyDoc())
  .default(() => emptyDoc());

/** Plain text to paragraphs (one per line). */
export function textToDoc(text: string): RichDoc {
  const lines = text.split(/\r?\n/);
  return {
    type: 'doc',
    content: lines.map((line) =>
      line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
    ),
  };
}

const BLOCKS = new Set([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
]);

/** The visible text of a document (for search, snippets and diffs). */
export function docText(doc: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value !== 'object' || value === null) return;
    const item = value as RichNode;
    if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text);
    if (item.type === WIKI_LINK) {
      const label = item.attrs?.['label'];
      if (typeof label === 'string') parts.push(label);
    }
    if (Array.isArray(item.content)) for (const child of item.content) walk(child);
    if (BLOCKS.has(item.type)) parts.push('\n');
  };
  walk(doc);
  return parts
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Ids of all records a document links to, in order, without duplicates. */
export function docLinks(doc: unknown): string[] {
  const ids: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value !== 'object' || value === null) return;
    const item = value as RichNode;
    if (item.type === WIKI_LINK) {
      const id = item.attrs?.['id'];
      if (typeof id === 'string' && !ids.includes(id)) ids.push(id);
    }
    if (Array.isArray(item.content)) for (const child of item.content) walk(child);
  };
  walk(doc);
  return ids;
}

/** Links found anywhere in a record's data (every rich-text field). */
export function dataLinks(data: unknown): string[] {
  const ids: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (typeof value === 'object' && value !== null) {
      const item = value as Record<string, unknown>;
      if (item['type'] === 'doc') {
        for (const id of docLinks(item)) if (!ids.includes(id)) ids.push(id);
        return;
      }
      for (const child of Object.values(item)) walk(child);
    }
  };
  walk(data);
  return ids;
}

/** A field value as searchable text: strings as they are, documents as their text. */
export function fieldText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && (value as RichNode).type === 'doc') {
    return docText(value);
  }
  return '';
}

/** Every `[[link]]` in a record's data with the label it was written with. */
export function dataLinkNodes(data: unknown): { id: string; label: string }[] {
  const found: { id: string; label: string }[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (typeof value === 'object' && value !== null) {
      const item = value as Record<string, unknown>;
      if (item['type'] === WIKI_LINK) {
        const attrs = (item['attrs'] ?? {}) as Record<string, unknown>;
        const id = attrs['id'];
        const label = attrs['label'];
        if (typeof id === 'string')
          found.push({ id, label: typeof label === 'string' ? label : '' });
        return;
      }
      for (const child of Object.values(item)) walk(child);
    }
  };
  walk(data);
  return found;
}

/** The label a `[[link]]` was written with. */
export function labelOf(node: RichNode): string {
  const label = node.attrs?.['label'];
  return typeof label === 'string' ? label : '';
}
