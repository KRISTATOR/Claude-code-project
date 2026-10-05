import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
  convertMillimetersToTwip,
  type ISectionOptions,
} from 'docx';
import { labelOf, WIKI_LINK, type RichNode } from '../richtext';
import { fontById } from './fonts';
import { fillFields } from './html';

/**
 * Word output (docs/PLAN.md §2.9): each piece is its own section with the
 * page size, a grey organizer strip, the writer's font and ink. Word uses
 * the fonts installed on the computer that opens the file; "Uložit písma"
 * in the app exports them for installing.
 */
export interface DocxPiece {
  size: 'A4' | 'A5';
  fontId: string;
  /** "#rrggbb" */
  ink: string;
  sizePt: number;
  strip?: string;
  letterhead?: string;
  date?: string;
  body: unknown;
  signature?: string;
  fields?: Record<string, string>;
}

const PAGE = {
  A4: { width: 210, height: 297, margin: 20 },
  A5: { width: 148, height: 210, margin: 14 },
} as const;

interface RunStyle {
  font: string;
  color: string;
  size: number;
}

function runs(nodes: RichNode[] | undefined, style: RunStyle, fields?: Record<string, string>) {
  const result: TextRun[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      result.push(new TextRun({ break: 1, ...style }));
    } else if (node.type === WIKI_LINK) {
      result.push(new TextRun({ text: labelOf(node), ...style }));
    } else if (node.type === 'text') {
      const marks = new Set((node.marks ?? []).map((mark) => mark.type));
      result.push(
        new TextRun({
          text: fillFields(node.text ?? '', fields),
          bold: marks.has('bold'),
          italics: marks.has('italic'),
          strike: marks.has('strike'),
          ...(marks.has('underline') ? { underline: {} } : {}),
          ...style,
        }),
      );
    }
  }
  return result;
}

/** Rich text as Word paragraphs (lists become bullets or "1." prefixes). */
export function docxParagraphs(
  doc: unknown,
  style: RunStyle,
  fields?: Record<string, string>,
): Paragraph[] {
  const out: Paragraph[] = [];
  const block = (node: RichNode, list?: { ordered: boolean; index: number }) => {
    switch (node.type) {
      case 'paragraph':
        out.push(
          new Paragraph({
            children: [
              ...(list?.ordered
                ? [new TextRun({ text: `${String(list.index)}. `, ...style })]
                : []),
              ...runs(node.content, style, fields),
            ],
            ...(list && !list.ordered ? { bullet: { level: 0 } } : {}),
            spacing: { after: 120 },
          }),
        );
        break;
      case 'heading':
        out.push(
          new Paragraph({
            heading: node.attrs?.['level'] === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2,
            children: runs(node.content, { ...style, size: style.size + 6 }, fields),
          }),
        );
        break;
      case 'bulletList':
      case 'orderedList':
        (node.content ?? []).forEach((item, index) => {
          for (const child of item.content ?? []) {
            block(child, { ordered: node.type === 'orderedList', index: index + 1 });
          }
        });
        break;
      case 'blockquote':
        for (const child of node.content ?? []) {
          out.push(
            new Paragraph({
              indent: { left: convertMillimetersToTwip(10) },
              children: runs(child.content, style, fields),
            }),
          );
        }
        break;
      default:
        for (const child of node.content ?? []) block(child, list);
    }
  };
  const root = (typeof doc === 'object' && doc !== null ? doc : { type: 'doc' }) as RichNode;
  for (const node of root.content ?? []) block(node);
  return out;
}

export function docxSection(piece: DocxPiece): ISectionOptions {
  const page = PAGE[piece.size];
  const style: RunStyle = {
    font: fontById(piece.fontId).name,
    color: piece.ink.replace('#', ''),
    size: Math.round(piece.sizePt * 2),
  };
  const children: Paragraph[] = [];
  if (piece.strip) {
    children.push(
      new Paragraph({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D4D4D4' },
        border: { bottom: { style: BorderStyle.DASHED, size: 6, color: '666666', space: 4 } },
        spacing: { after: 360 },
        children: [new TextRun({ text: piece.strip, font: 'Arial', size: 16, color: '333333' })],
      }),
    );
  }
  if (piece.letterhead) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: piece.letterhead, ...style, size: style.size + 6 })],
      }),
    );
  }
  if (piece.date) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 240 },
        children: [new TextRun({ text: piece.date, ...style })],
      }),
    );
  }
  children.push(...docxParagraphs(piece.body, style, piece.fields));
  if (piece.signature) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 360 },
        children: [new TextRun({ text: piece.signature, ...style, size: style.size + 8 })],
      }),
    );
  }
  return {
    properties: {
      page: {
        size: {
          width: convertMillimetersToTwip(page.width),
          height: convertMillimetersToTwip(page.height),
        },
        margin: {
          top: convertMillimetersToTwip(piece.strip ? 6 : page.margin),
          bottom: convertMillimetersToTwip(page.margin),
          left: convertMillimetersToTwip(page.margin),
          right: convertMillimetersToTwip(page.margin),
        },
      },
    },
    children,
  };
}

export async function buildDocx(pieces: DocxPiece[]): Promise<Uint8Array> {
  const document = new Document({
    creator: 'Zázemí',
    sections: pieces.map(docxSection),
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
