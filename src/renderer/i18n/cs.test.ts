import { describe, expect, it } from 'vitest';
import { createI18n } from '.';

describe('Czech i18n', () => {
  const i18n = createI18n();

  it('picks the right Czech plural form', () => {
    expect(i18n.t('plurals.file', { count: 1 })).toBe('1 soubor');
    expect(i18n.t('plurals.file', { count: 3 })).toBe('3 soubory');
    expect(i18n.t('plurals.file', { count: 5 })).toBe('5 souborů');
    expect(i18n.t('plurals.file', { count: 0 })).toBe('0 souborů');
  });

  it('interpolates values', () => {
    expect(i18n.t('app.version', { version: '1.2.3' })).toBe('Verze 1.2.3');
  });
});
