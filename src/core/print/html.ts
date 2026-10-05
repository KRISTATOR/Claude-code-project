import type { PaperStyle } from '../kinds/documents';
import { labelOf, WIKI_LINK, type RichNode } from '../richtext';
import { BUNDLED_FONTS, fontById, fontFaceCss } from './fonts';

/**
 * Print pages are plain HTML and CSS (docs/PLAN.md §2.9), built here as
 * strings so they can be tested without a browser. Each printed piece is a
 * section with its own named @page (size and paper colour), a grey
 * organizer strip at the very top of its first page to cut off, and a table
 * whose repeating header and footer rows keep the top and bottom margins on
 * every following page.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Replaces {field} placeholders; unknown fields stay as written. */
export function fillFields(text: string, fields: Record<string, string> | undefined): string {
  if (!fields) return text;
  return text.replace(/\{([a-z_]+)\}/g, (whole, key: string) => fields[key] ?? whole);
}

const MARKS: Record<string, [string, string]> = {
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  strike: ['<s>', '</s>'],
  underline: ['<u>', '</u>'],
  code: ['<code>', '</code>'],
};

/** Rich text (TipTap JSON) as print HTML; `[[links]]` print as their label. */
export function richHtml(doc: unknown, fields?: Record<string, string>): string {
  const render = (value: unknown): string => {
    if (typeof value !== 'object' || value === null) return '';
    const node = value as RichNode;
    const children = (node.content ?? []).map(render).join('');
    switch (node.type) {
      case 'doc':
        return children;
      case 'text': {
        let html = escapeHtml(fillFields(node.text ?? '', fields));
        for (const mark of node.marks ?? []) {
          const tags = MARKS[mark.type];
          if (tags) html = `${tags[0]}${html}${tags[1]}`;
        }
        return html;
      }
      case WIKI_LINK:
        return escapeHtml(labelOf(node));
      case 'paragraph':
        return `<p>${children || '&nbsp;'}</p>`;
      case 'heading': {
        const level = node.attrs?.['level'] === 3 ? 3 : 2;
        return `<h${level}>${children}</h${level}>`;
      }
      case 'bulletList':
        return `<ul>${children}</ul>`;
      case 'orderedList':
        return `<ol>${children}</ol>`;
      case 'listItem':
        return `<li>${children}</li>`;
      case 'blockquote':
        return `<blockquote>${children}</blockquote>`;
      case 'hardBreak':
        return '<br>';
      case 'horizontalRule':
        return '<hr>';
      case 'codeBlock':
        return `<pre>${children}</pre>`;
      default:
        return children;
    }
  };
  return render(doc);
}

/** Plain text (with line breaks) as print HTML. */
export function textHtml(text: string, fields?: Record<string, string>): string {
  return fillFields(text, fields)
    .split(/\r?\n\r?\n/)
    .map((block) => `<p>${escapeHtml(block).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

export type PageSize = 'A4' | 'A5' | 'A4-landscape' | 'A6-landscape';

const SIZES: Record<PageSize, { css: string; padding: string; minHeight: string }> = {
  A4: { css: 'A4', padding: '20mm', minHeight: '297mm' },
  A5: { css: 'A5', padding: '14mm', minHeight: '210mm' },
  'A4-landscape': { css: 'A4 landscape', padding: '14mm', minHeight: '210mm' },
  // Chromium knows no "A6" keyword; explicit millimetres work everywhere.
  'A6-landscape': { css: '148mm 105mm', padding: '8mm', minHeight: '105mm' },
};

const PAPER: Record<PaperStyle, string> = {
  plain: 'background:#ffffff',
  aged: 'background:#f3ead6',
  parchment:
    'background-color:#efe1bd;background-image:radial-gradient(ellipse at center,#f5ead0 55%,#d8c08a 100%)',
  official: 'background:#fdfdf8',
};

export interface Look {
  fontId: string;
  ink: string;
  paper: PaperStyle;
  sizePt: number;
}

export const DEFAULT_LOOK: Look = {
  fontId: 'eb-garamond',
  ink: '#1a1a1a',
  paper: 'plain',
  sizePt: 12,
};

export interface PrintPiece {
  size: PageSize;
  look: Look;
  /** The organizer strip (cut off before handing out); omitted when empty. */
  strip?: string;
  /** Body HTML (already escaped / built with the helpers above). */
  html: string;
  /** Extra CSS class for the body (e.g. "sign", "booklet"). */
  className?: string;
}

/** One HTML document printing every piece on its own pages, in order. */
export function printHtml(
  pieces: PrintPiece[],
  options: { fontsBase?: string; css?: string } = {},
): string {
  const fontsBase = options.fontsBase ?? 'app://print/fonts/';
  const used = [...new Set(pieces.map((piece) => fontById(piece.look.fontId).id))]
    .map((id) => BUNDLED_FONTS.find((font) => font.id === id))
    .filter((font) => font !== undefined);
  const pages = new Map<string, string>();
  const sections = pieces.map((piece) => {
    const size = SIZES[piece.size];
    const pageName = `p_${piece.size.replace('-', '_')}_${piece.look.paper}`;
    pages.set(pageName, `@page ${pageName}{size:${size.css};margin:0;${PAPER[piece.look.paper]}}`);
    const font = fontById(piece.look.fontId);
    const strip = piece.strip
      ? `<div class="strip" style="padding:0 ${size.padding}">${escapeHtml(piece.strip)}</div>`
      : '';
    const style = [
      `page:${pageName}`,
      `padding:0 ${size.padding}`,
      `font-family:'${font.family}',serif`,
      `color:${piece.look.ink}`,
      `font-size:${piece.look.sizePt}pt`,
    ].join(';');
    return `<section class="piece ${piece.className ?? ''}" style="${style}">${strip}<table class="flow"><thead><tr><td><div class="top${piece.strip ? ' with-strip' : ''}"></div></td></tr></thead><tfoot><tr><td><div class="bottom"></div></td></tr></tfoot><tbody><tr><td>${piece.html}</td></tr></tbody></table></section>`;
  });
  const preload = used
    .flatMap((font) => font.files)
    .map((file) => `<link rel="preload" as="font" href="${fontsBase}${file.file}" crossorigin>`)
    .join('');
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Zázemí</title>${preload}<style>
${fontFaceCss(used, fontsBase)}
${[...pages.values()].join('\n')}
html,body{margin:0;padding:0}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact;line-height:1.35}
.piece{position:relative;break-after:page}
.piece:last-child{break-after:auto}
.strip{position:absolute;top:0;left:0;right:0;height:9mm;line-height:9mm;background:#d4d4d4;color:#333;border-bottom:1px dashed #666;font:8.5pt/9mm Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
table.flow{width:100%;border-collapse:collapse}
table.flow td{padding:0;vertical-align:top}
.top{height:14mm}.top.with-strip{height:18mm}.bottom{height:12mm}
p{margin:0 0 .6em}
h1,h2,h3{margin:.4em 0 .4em;line-height:1.15}
blockquote{margin:.4em 1.5em;font-style:italic}
.letterhead{text-align:center;font-size:1.25em;margin-bottom:1em;letter-spacing:.05em}
.meta{display:flex;justify-content:space-between;margin-bottom:1em}
.signature{margin-top:1.5em;text-align:right;font-size:1.4em}
.number{position:absolute;right:0;top:0;font-size:.8em;opacity:.7}
table.list{width:100%;border-collapse:collapse;font-size:.95em}
table.list th,table.list td{border:1px solid currentColor;padding:2mm 3mm;text-align:left}
${options.css ?? ''}
</style></head><body>${sections.join('')}</body></html>`;
}
