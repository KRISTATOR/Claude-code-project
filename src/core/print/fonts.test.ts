import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CZECH_LETTERS, fontCodepoints, missingCzech } from './cmap';
import { BUNDLED_FONTS, fontById, fontFaceCss } from './fonts';

const dir = join(import.meta.dirname, '../../renderer/public/fonts');

describe('bundled fonts', () => {
  it.each(BUNDLED_FONTS.flatMap((font) => font.files.map((file) => [font.id, file.file])))(
    '%s (%s) can write every Czech letter',
    (_id, file) => {
      const codepoints = fontCodepoints(new Uint8Array(readFileSync(join(dir, file))));
      expect(missingCzech(codepoints)).toBe('');
    },
  );

  it('each font ships its licence', () => {
    for (const font of BUNDLED_FONTS) {
      expect(existsSync(join(dir, 'licenses', font.licenseFile))).toBe(true);
    }
  });

  it('falls back to the default font and writes @font-face rules', () => {
    expect(fontById('nope').id).toBe('eb-garamond');
    expect(fontFaceCss([fontById('caveat')], 'fonts/')).toContain('url("fonts/caveat.ttf")');
  });
});

describe('missingCzech', () => {
  it('lists the letters a font lacks', () => {
    const latinOnly = new Set(
      Array.from('abcdefghijklmnopqrstuvwxyzáéíóúý').map((c) => c.codePointAt(0) ?? 0),
    );
    expect(missingCzech(latinOnly)).toBe('čďěňřšťůžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ');
    const all = new Set(Array.from(CZECH_LETTERS).map((c) => c.codePointAt(0) ?? 0));
    expect(missingCzech(all)).toBe('');
  });
});
