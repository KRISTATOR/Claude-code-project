import { describe, expect, it } from 'vitest';
import {
  extensionOf,
  mimeOf,
  officeAppOf,
  previewKindOf,
  sanitizeFileName,
  uniqueName,
} from './names';

describe('file types', () => {
  it('reads extensions case-insensitively', () => {
    expect(extensionOf('Dopis č. 12.DOCX')).toBe('docx');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('README')).toBe('');
  });
  it('knows previews, Office apps and MIME types', () => {
    expect(previewKindOf('mapa.PNG')).toBe('image');
    expect(previewKindOf('pravidla.md')).toBe('markdown');
    expect(previewKindOf('archiv.zip')).toBe('none');
    expect(officeAppOf('rozpocet.xlsx')).toBe('excel');
    expect(officeAppOf('proslov.pptx')).toBe('powerpoint');
    expect(officeAppOf('mapa.png')).toBeNull();
    expect(mimeOf('a.pdf')).toBe('application/pdf');
    expect(mimeOf('a.xyz')).toBe('application/octet-stream');
  });
});

describe('sanitizeFileName', () => {
  it('replaces characters Windows forbids and keeps Czech letters', () => {
    expect(sanitizeFileName('Dopis: Hraběnce / tajné?.docx')).toBe('Dopis_ Hraběnce _ tajné_.docx');
  });
  it('trims trailing dots and spaces and avoids device names', () => {
    expect(sanitizeFileName('poznámky. . ')).toBe('poznámky');
    expect(sanitizeFileName('CON.txt')).toBe('_CON.txt');
    expect(sanitizeFileName('   ')).toBe('soubor');
  });
  it('shortens very long names but keeps the extension', () => {
    const long = `${'a'.repeat(300)}.docx`;
    const result = sanitizeFileName(long);
    expect(result.length).toBe(150);
    expect(result.endsWith('.docx')).toBe(true);
  });
});

describe('uniqueName', () => {
  it('numbers duplicates like Windows does', () => {
    expect(uniqueName('Dopis.docx', ['dopis.docx', 'Dopis (2).docx'])).toBe('Dopis (3).docx');
    expect(uniqueName('Nová složka', ['Nová složka'])).toBe('Nová složka (2)');
    expect(uniqueName('Volné.txt', ['Jiné.txt'])).toBe('Volné.txt');
  });
});
