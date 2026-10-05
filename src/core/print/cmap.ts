/**
 * Reads which characters a TrueType/OpenType font can draw (its `cmap`
 * table, formats 4 and 12). Used to refuse fonts without Czech letters.
 */
export function fontCodepoints(bytes: Uint8Array): Set<number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < tables; i += 1) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    if (tag === 'cmap') cmap = view.getUint32(record + 8);
  }
  if (cmap < 0) throw new Error('font has no cmap table');

  const result = new Set<number>();
  const subtables = view.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i += 1) {
    const platform = view.getUint16(cmap + 4 + i * 8);
    const encoding = view.getUint16(cmap + 6 + i * 8);
    // Unicode subtables only: platform 0, or Windows (3) with BMP (1) / full (10).
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const offset = cmap + view.getUint32(cmap + 8 + i * 8);
    const format = view.getUint16(offset);
    if (format === 4) readFormat4(view, offset, result);
    else if (format === 12) readFormat12(view, offset, result);
  }
  return result;
}

function readFormat4(view: DataView, offset: number, into: Set<number>): void {
  const segments = view.getUint16(offset + 6) / 2;
  const ends = offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  for (let s = 0; s < segments; s += 1) {
    const end = view.getUint16(ends + s * 2);
    const start = view.getUint16(starts + s * 2);
    const delta = view.getInt16(deltas + s * 2);
    const rangeOffset = view.getUint16(rangeOffsets + s * 2);
    for (let code = start; code <= end && code !== 0xffff; code += 1) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const at = rangeOffsets + s * 2 + rangeOffset + (code - start) * 2;
        glyph = view.getUint16(at);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) into.add(code);
    }
  }
}

function readFormat12(view: DataView, offset: number, into: Set<number>): void {
  const groups = view.getUint32(offset + 12);
  for (let g = 0; g < groups; g += 1) {
    const at = offset + 16 + g * 12;
    const start = view.getUint32(at);
    const end = view.getUint32(at + 4);
    const glyph = view.getUint32(at + 8);
    for (let code = start; code <= end; code += 1) {
      if (glyph + (code - start) !== 0) into.add(code);
    }
  }
}

/** Every letter Czech needs, lower and upper case (the brief's list and more). */
export const CZECH_LETTERS = 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ';

/** The Czech letters a font cannot draw ("" when it has them all). */
export function missingCzech(codepoints: Set<number>): string {
  return Array.from(CZECH_LETTERS)
    .filter((letter) => !codepoints.has(letter.codePointAt(0) ?? 0))
    .join('');
}
