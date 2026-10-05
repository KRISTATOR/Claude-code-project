/**
 * Fonts bundled with the app (src/renderer/public/fonts, open licences in
 * fonts/licenses). A test refuses any font that cannot write Czech.
 */
export const fontCategories = ['handwriting', 'typewriter', 'blackletter', 'serif'] as const;
export type FontCategory = (typeof fontCategories)[number];

export interface BundledFont {
  id: string;
  /** CSS font-family name used in previews and print. */
  family: string;
  category: FontCategory;
  files: { file: string; weight: string; style: 'normal' | 'italic' }[];
  license: 'OFL-1.1' | 'Apache-2.0';
  licenseFile: string;
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
  {
    id: 'caveat',
    family: 'Zazemi Caveat',
    category: 'handwriting',
    files: [{ file: 'caveat.ttf', weight: '400 700', style: 'normal' }],
    license: 'OFL-1.1',
    licenseFile: 'caveat.txt',
  },
  {
    id: 'marck-script',
    family: 'Zazemi Marck Script',
    category: 'handwriting',
    files: [{ file: 'marck-script.ttf', weight: '400', style: 'normal' }],
    license: 'OFL-1.1',
    licenseFile: 'marck-script.txt',
  },
  {
    id: 'courier-prime',
    family: 'Zazemi Courier Prime',
    category: 'typewriter',
    files: [
      { file: 'courier-prime.ttf', weight: '400', style: 'normal' },
      { file: 'courier-prime-bold.ttf', weight: '700', style: 'normal' },
    ],
    license: 'OFL-1.1',
    licenseFile: 'courier-prime.txt',
  },
  {
    id: 'special-elite',
    family: 'Zazemi Special Elite',
    category: 'typewriter',
    files: [{ file: 'special-elite.ttf', weight: '400', style: 'normal' }],
    license: 'Apache-2.0',
    licenseFile: 'special-elite.txt',
  },
  {
    id: 'grenze-gotisch',
    family: 'Zazemi Grenze Gotisch',
    category: 'blackletter',
    files: [{ file: 'grenze-gotisch.ttf', weight: '100 900', style: 'normal' }],
    license: 'OFL-1.1',
    licenseFile: 'grenze-gotisch.txt',
  },
  {
    id: 'eb-garamond',
    family: 'Zazemi EB Garamond',
    category: 'serif',
    files: [
      { file: 'eb-garamond.ttf', weight: '400 800', style: 'normal' },
      { file: 'eb-garamond-italic.ttf', weight: '400 800', style: 'italic' },
    ],
    license: 'OFL-1.1',
    licenseFile: 'eb-garamond.txt',
  },
];

export const DEFAULT_FONT_ID = 'eb-garamond';

export function fontById(id: string | null | undefined): BundledFont {
  return (
    BUNDLED_FONTS.find((font) => font.id === id) ??
    BUNDLED_FONTS.find((font) => font.id === DEFAULT_FONT_ID) ??
    (BUNDLED_FONTS[0] as BundledFont)
  );
}

/** @font-face rules for the given fonts, loading files from `baseUrl` ("fonts/"). */
export function fontFaceCss(fonts: readonly BundledFont[], baseUrl: string): string {
  return fonts
    .flatMap((font) =>
      font.files.map(
        (file) =>
          `@font-face{font-family:"${font.family}";src:url("${baseUrl}${file.file}") format("truetype");font-weight:${file.weight};font-style:${file.style};font-display:block}`,
      ),
    )
    .join('\n');
}
