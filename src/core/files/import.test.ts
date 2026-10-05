import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  normalizePath,
  planImport,
  planSummary,
  reportText,
  withoutCopyNumber,
  type ImportSource,
} from './takeout';
import { readZip, ZipError } from './zip';

/** A stored zip64 archive written by hand (no library writes one for small files). */
function zip64(name: string, content: Uint8Array): Uint8Array {
  const nameBytes = strToU8(name);
  const parts: Uint8Array[] = [];
  const u16 = (n: number) => new Uint8Array(new Uint16Array([n]).buffer);
  const u32 = (n: number) => new Uint8Array(new Uint32Array([n]).buffer);
  const u64 = (n: number) => new Uint8Array(new BigUint64Array([BigInt(n)]).buffer);
  const local: Uint8Array[] = [
    u32(0x04034b50),
    u16(45),
    u16(0x800),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
  ];
  local.push(u32(0xffffffff), u32(0xffffffff), u16(nameBytes.length), u16(20), nameBytes);
  local.push(u16(1), u16(16), u64(content.length), u64(content.length), content);
  parts.push(...local);
  const centralOffset = parts.reduce((sum, part) => sum + part.length, 0);
  const central: Uint8Array[] = [
    u32(0x02014b50),
    u16(45),
    u16(45),
    u16(0x800),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
  ];
  central.push(u32(0xffffffff), u32(0xffffffff), u16(nameBytes.length), u16(28), u16(0));
  central.push(u16(0), u16(0), u32(0), u32(0xffffffff), nameBytes);
  central.push(u16(1), u16(24), u64(content.length), u64(content.length), u64(0));
  parts.push(...central);
  const centralSize = parts.reduce((sum, part) => sum + part.length, 0) - centralOffset;
  const eocd64Offset = centralOffset + centralSize;
  parts.push(u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0));
  parts.push(u64(1), u64(1), u64(centralSize), u64(centralOffset));
  parts.push(u32(0x07064b50), u32(0), u64(eocd64Offset), u32(1));
  parts.push(u32(0x06054b50), u16(0), u16(0), u16(0xffff), u16(0xffff));
  parts.push(u32(0xffffffff), u32(0xffffffff), u16(0));
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

describe('zip', () => {
  it('reads stored and deflated entries with Czech names', () => {
    const bytes = zipSync({
      'Chýnice/Dopisy/Dopis hraběnce.txt': strToU8('Milá hraběnko'.repeat(50)),
      'Chýnice/obrázek.png': [new Uint8Array([1, 2, 3]), { level: 0 }],
    });
    const entries = readZip(bytes);
    const byPath = new Map(entries.map((item) => [item.entry.path, item]));
    expect([...byPath.keys()].sort()).toEqual([
      'Chýnice/Dopisy/Dopis hraběnce.txt',
      'Chýnice/obrázek.png',
    ]);
    expect(new TextDecoder().decode(byPath.get('Chýnice/Dopisy/Dopis hraběnce.txt')?.data())).toBe(
      'Milá hraběnko'.repeat(50),
    );
    expect(byPath.get('Chýnice/obrázek.png')?.data()).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('reads zip64 archives', () => {
    const [item] = readZip(zip64('Takeout/Disk/velký.bin', new Uint8Array([7, 8, 9])));
    expect(item?.entry).toMatchObject({ path: 'Takeout/Disk/velký.bin', size: 3 });
    expect(item?.data()).toEqual(new Uint8Array([7, 8, 9]));
  });

  it('refuses something that is not a zip', () => {
    expect(() => readZip(strToU8('ahoj'))).toThrow(ZipError);
  });
});

describe('import plan', () => {
  const source = (path: string, size = 10): ImportSource => ({ path, size, ref: path });

  it('strips Takeout wrappers and keeps the folder structure', () => {
    expect(normalizePath('Takeout/Disk Google/Chýnice/Dopisy/a.docx')).toEqual([
      'Chýnice',
      'Dopisy',
      'a.docx',
    ]);
    expect(normalizePath('Takeout/Drive/a.docx')).toEqual(['a.docx']);
    expect(normalizePath('Chýnice-20261005T101112Z-001/Chýnice/a.docx')).toEqual([
      'Chýnice-20261005T101112Z-001',
      'Chýnice',
      'a.docx',
    ]);
  });

  it('recognizes Google copy numbers', () => {
    expect(withoutCopyNumber('Dopis(1).docx')).toBe('Dopis.docx');
    expect(withoutCopyNumber('Dopis (12).docx')).toBe('Dopis.docx');
    expect(withoutCopyNumber('Fáze (II).docx')).toBe('Fáze (II).docx');
    expect(withoutCopyNumber('Poznámky (1)')).toBe('Poznámky');
  });

  it('skips Google-only items, junk, oversized files and repeats', () => {
    const plan = planImport(
      [
        source('Takeout/archive_browser.html'),
        source('Takeout/Disk/Chýnice/'),
        source('Takeout/Disk/Chýnice/Přihláška.gform'),
        source('Takeout/Disk/Chýnice/Odkaz.gdoc'),
        source('Takeout/Disk/Chýnice/~$Dopis.docx'),
        source('Takeout/Disk/Chýnice/Thumbs.db'),
        source('Takeout/Disk/Chýnice/Mapa.png', 60 * 1024 * 1024),
        source('Takeout/Disk/Chýnice/Dopisy/Dopis.docx'),
        source('Takeout/Disk/Chýnice/Dopisy/Dopis(1).docx'),
        source('Takeout/Disk/Chýnice/Dopisy/Dopis.docx'),
        source('Takeout/Disk/Pravidla.pdf'),
      ],
      { maxBytes: 50 * 1024 * 1024 },
    );
    expect(plan.files.map((file) => file.path)).toEqual([
      'Chýnice/Dopisy/Dopis.docx',
      'Chýnice/Dopisy/Dopis(1).docx',
      'Pravidla.pdf',
    ]);
    expect(plan.files[0]).toMatchObject({ folders: ['Chýnice', 'Dopisy'], name: 'Dopis.docx' });
    expect(plan.skipped.map((item) => `${item.reason}:${item.path}`)).toEqual([
      'takeout_index:archive_browser.html',
      'google_form:Chýnice/Přihláška.gform',
      'google_link:Chýnice/Odkaz.gdoc',
      'junk:Chýnice/~$Dopis.docx',
      'junk:Chýnice/Thumbs.db',
      'too_large:Chýnice/Mapa.png',
      'duplicate:Chýnice/Dopisy/Dopis.docx',
    ]);
    expect(planSummary(plan)).toEqual([
      { folder: '', files: 1 },
      { folder: 'Chýnice', files: 2 },
    ]);
  });

  it('writes a plain-text report', () => {
    const text = reportText(
      {
        imported: ['Chýnice/Dopis.docx'],
        skipped: [{ path: 'Přihláška.gform', reason: 'google_form' }],
        failed: [{ path: 'Mapa.png', message: 'offline' }],
      },
      {
        title: 'Import',
        imported: 'Načteno',
        skipped: 'Přeskočeno',
        failed: 'Selhalo',
        reasons: {
          junk: 'pomocný soubor',
          google_form: 'formulář Google',
          google_link: 'odkaz',
          takeout_index: 'rejstřík',
          too_large: 'příliš velký',
          duplicate: 'duplikát',
          existing: 'už je na disku',
        },
      },
    );
    expect(text).toContain('Načteno (1)\r\n  Chýnice/Dopis.docx');
    expect(text).toContain('  Přihláška.gform – formulář Google');
    expect(text).toContain('Selhalo (1)\r\n  Mapa.png – offline');
  });
});
