import { strFromU8, unzipSync } from 'fflate';
import { extensionOf } from './names';

/**
 * Plain text of Office documents for full-text search (docs/PLAN.md §2.8).
 * Word, Excel and PowerPoint files are zip archives of XML. PDFs are handled
 * by the renderer with pdf.js. Returns null for types this cannot read.
 */
export const MAX_TEXT = 2_000_000;

export function extractText(name: string, bytes: Uint8Array): string | null {
  const ext = extensionOf(name);
  try {
    if (['txt', 'md', 'csv', 'json'].includes(ext))
      return clip(new TextDecoder('utf-8').decode(bytes));
    if (ext === 'docx' || ext === 'dotx') return clip(docxText(bytes));
    if (ext === 'xlsx' || ext === 'xltx') return clip(xlsxText(bytes));
    if (ext === 'pptx') return clip(pptxText(bytes));
  } catch {
    return null;
  }
  return null;
}

function clip(text: string): string {
  const normalized = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized.length > MAX_TEXT ? normalized.slice(0, MAX_TEXT) : normalized;
}

function unzip(bytes: Uint8Array, wanted: (path: string) => boolean): Record<string, string> {
  const files = unzipSync(bytes, { filter: (file) => wanted(file.name) });
  return Object.fromEntries(Object.entries(files).map(([path, data]) => [path, strFromU8(data)]));
}

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    const code = lower.startsWith('#x')
      ? parseInt(lower.slice(2), 16)
      : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  });
}

/** Word: text runs <w:t>, tabs, line breaks, one line per paragraph. */
export function wordXmlText(xml: string): string {
  const token = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;
  return xml
    .split(/<\/w:p>/)
    .map((paragraph) =>
      [...paragraph.matchAll(token)]
        .map((match) =>
          match[0] === '<w:tab/>'
            ? '\t'
            : match[0] === '<w:br/>'
              ? '\n'
              : decodeXml(match[1] ?? ''),
        )
        .join(''),
    )
    .join('\n');
}

function docxText(bytes: Uint8Array): string {
  const parts = unzip(bytes, (path) =>
    /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(path),
  );
  const order = Object.keys(parts).sort((a, b) =>
    a.includes('document') ? -1 : b.includes('document') ? 1 : a.localeCompare(b),
  );
  return order.map((path) => wordXmlText(parts[path] ?? '').trim()).join('\n');
}

/** PowerPoint: <a:t> runs, one line per paragraph, slides in order. */
export function slideXmlText(xml: string): string {
  return xml
    .split(/<\/a:p>/)
    .map((paragraph) =>
      decodeXml(
        [...paragraph.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => m[1] ?? '').join(''),
      ),
    )
    .filter((line) => line.length > 0)
    .join('\n');
}

function pptxText(bytes: Uint8Array): string {
  const parts = unzip(bytes, (path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  const number = (path: string) => Number(/slide(\d+)\.xml$/.exec(path)?.[1] ?? 0);
  return Object.keys(parts)
    .sort((a, b) => number(a) - number(b))
    .map((path) => slideXmlText(parts[path] ?? ''))
    .join('\n\n');
}

/** Excel: shared strings plus inline strings and literal values, sheet by sheet. */
function xlsxText(bytes: Uint8Array): string {
  const parts = unzip(
    bytes,
    (path) => path === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(path),
  );
  const shared = [...(parts['xl/sharedStrings.xml'] ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (m) =>
      decodeXml(
        [...(m[1] ?? '').matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => t[1] ?? '').join(''),
      ),
  );
  const number = (path: string) => Number(/sheet(\d+)\.xml$/.exec(path)?.[1] ?? 0);
  const sheets = Object.keys(parts)
    .filter((path) => path.startsWith('xl/worksheets/'))
    .sort((a, b) => number(a) - number(b));
  const lines: string[] = [];
  for (const path of sheets) {
    for (const row of (parts[path] ?? '').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cell of (row[1] ?? '').matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1] ?? '';
        const body = cell[2] ?? '';
        const value = /<v>([^<]*)<\/v>/.exec(body)?.[1];
        if (/t="s"/.test(attrs) && value !== undefined) cells.push(shared[Number(value)] ?? '');
        else if (/t="inlineStr"/.test(attrs))
          cells.push(decodeXml((/<t[^>]*>([^<]*)<\/t>/.exec(body) ?? [])[1] ?? ''));
        else if (value !== undefined) cells.push(decodeXml(value));
      }
      if (cells.some((c) => c !== '')) lines.push(cells.join('\t'));
    }
  }
  return lines.join('\n');
}
