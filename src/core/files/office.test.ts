import { describe, expect, it } from 'vitest';
import { isOfficeLockFile, isOfficeTempFile } from './office';

describe('office lock files', () => {
  it('recognises Microsoft Office and LibreOffice lock files', () => {
    expect(isOfficeLockFile('~$pis č. 12.docx')).toBe(true);
    expect(isOfficeLockFile('~$rozpocet.xlsx')).toBe(true);
    expect(isOfficeLockFile('.~lock.Dopis.docx#')).toBe(true);
    expect(isOfficeLockFile('Dopis.docx')).toBe(false);
    expect(isOfficeLockFile('.~lock.Dopis.docx')).toBe(false);
  });
  it('recognises temporary save files', () => {
    expect(isOfficeTempFile('~WRL0004.tmp')).toBe(true);
    expect(isOfficeTempFile('Dopis.docx')).toBe(false);
  });
});
