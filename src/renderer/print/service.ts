import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildDocx, type DocxPiece } from '@core/print/docx';
import { printHtml, type PrintPiece } from '@core/print/html';

/** Print pieces to one PDF (main renders the HTML in a script-less window). */
export async function toPdf(pieces: PrintPiece[]): Promise<Uint8Array> {
  return window.zazemi.print.toPdf({ html: printHtml(pieces), pageSize: 'A4', landscape: false });
}

export function toDocx(pieces: DocxPiece[]): Promise<Uint8Array> {
  return buildDocx(pieces);
}

/** A file name Windows accepts, from a Czech title. */
export function fileName(title: string, extension: string): string {
  const base =
    title
      .replace(/[<>:"/\\|?*]/g, ' ')
      .split('')
      .filter((char) => char.charCodeAt(0) >= 32)
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, 120) || 'zazemi';
  return `${base}.${extension}`;
}

export async function save(
  bytes: Uint8Array,
  title: string,
  kind: 'pdf' | 'docx' | 'xlsx',
): Promise<boolean> {
  const filters = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel' } as const;
  const result = await window.zazemi.dialogs.saveFile({
    defaultName: fileName(title, kind),
    filters: [{ name: filters[kind], extensions: [kind] }],
    data: bytes,
  });
  return result.saved;
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
}

/** Joins PDFs in order. */
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const source = await PDFDocument.load(part, { ignoreEncryption: true });
    const pages = await out.copyPages(source, source.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

export interface Stamp {
  /** 0-based page index. */
  page: number;
  /** Centred at the bottom (a page number). */
  bottom?: string;
  /** Top right corner (a shelf mark). */
  topRight?: string;
}

/**
 * Adds page numbers and shelf marks. They use a standard PDF font, so only
 * ASCII text belongs here (digits, Roman numerals, "/").
 */
export async function stampPages(bytes: Uint8Array, stamps: Stamp[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const color = rgb(0.25, 0.25, 0.25);
  for (const stamp of stamps) {
    const page = pdf.getPage(stamp.page);
    const { width } = page.getSize();
    if (stamp.bottom) {
      const size = 10;
      const textWidth = font.widthOfTextAtSize(stamp.bottom, size);
      page.drawText(stamp.bottom, { x: (width - textWidth) / 2, y: 18, size, font, color });
    }
    if (stamp.topRight) {
      const size = 9;
      const textWidth = font.widthOfTextAtSize(stamp.topRight, size);
      const { height } = page.getSize();
      page.drawText(stamp.topRight, {
        x: width - textWidth - 24,
        y: height - 22,
        size,
        font,
        color,
      });
    }
  }
  return pdf.save();
}

/** A4 landscape in PDF points. */
export const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
/** A4 portrait in PDF points. */
export const A4_PORTRAIT: [number, number] = [595.28, 841.89];

/**
 * Puts A5 pages two per A4 landscape side in `order` (1-based page numbers,
 * 0 = blank), as produced by bookletOrder().
 */
export async function imposeBooklet(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const sourcePages = source.getPages();
  const embedded = await out.embedPages(sourcePages);
  const [width, height] = A4_LANDSCAPE;
  for (let i = 0; i < order.length; i += 2) {
    const sheet = out.addPage([width, height]);
    for (const [slot, number] of [order[i], order[i + 1]].entries()) {
      const page = number ? embedded[number - 1] : undefined;
      if (!page) continue;
      const scale = Math.min(width / 2 / page.width, height / page.height);
      sheet.drawPage(page, {
        x: slot * (width / 2) + (width / 2 - page.width * scale) / 2,
        y: (height - page.height * scale) / 2,
        xScale: scale,
        yScale: scale,
      });
    }
  }
  return out.save();
}

/**
 * Puts small pages (cards) several to a sheet: A6 landscape cards fit 2×2 on
 * A4 landscape. Thin grey lines show where to cut.
 */
export async function imposeGrid(
  bytes: Uint8Array,
  layout: { cols: number; rows: number; sheet: [number, number] } = {
    cols: 2,
    rows: 2,
    sheet: A4_LANDSCAPE,
  },
): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const embedded = await out.embedPages(source.getPages());
  const [width, height] = layout.sheet;
  const cellWidth = width / layout.cols;
  const cellHeight = height / layout.rows;
  const perSheet = layout.cols * layout.rows;
  for (let first = 0; first < embedded.length; first += perSheet) {
    const sheet = out.addPage([width, height]);
    embedded.slice(first, first + perSheet).forEach((page, index) => {
      const col = index % layout.cols;
      const row = Math.floor(index / layout.cols);
      const scale = Math.min(cellWidth / page.width, cellHeight / page.height);
      sheet.drawPage(page, {
        x: col * cellWidth + (cellWidth - page.width * scale) / 2,
        y: height - (row + 1) * cellHeight + (cellHeight - page.height * scale) / 2,
        xScale: scale,
        yScale: scale,
      });
    });
    const grey = rgb(0.7, 0.7, 0.7);
    for (let col = 1; col < layout.cols; col += 1) {
      sheet.drawLine({
        start: { x: col * cellWidth, y: 0 },
        end: { x: col * cellWidth, y: height },
        thickness: 0.3,
        color: grey,
      });
    }
    for (let row = 1; row < layout.rows; row += 1) {
      sheet.drawLine({
        start: { x: 0, y: row * cellHeight },
        end: { x: width, y: row * cellHeight },
        thickness: 0.3,
        color: grey,
      });
    }
  }
  return out.save();
}
