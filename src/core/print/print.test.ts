import { describe, expect, it } from 'vitest';
import type { RecordRow } from '../model';
import { checkConsistency } from '../lore/consistency';
import { nextItem, pageRange, placeParts, roman, shelfMark } from './archive';
import { bookletOrder, bookletPageCount, bookletSheets } from './booklet';
import {
  compareNumbers,
  duplicateNumbers,
  nextNumber,
  referencedNumbers,
  selectDocuments,
  sortForDelivery,
} from './documents';
import { escapeHtml, fillFields, printHtml, richHtml, textHtml } from './html';
import { characterFields } from './merge';

let next = 0;
function rec(
  kind: string,
  title: string,
  data: Record<string, unknown> = {},
  extra: Partial<RecordRow> = {},
): RecordRow {
  next += 1;
  return {
    id: `id-${String(next)}`,
    team_id: 'team',
    kind,
    world_id: null,
    game_id: null,
    parent_id: null,
    title,
    data,
    visibility: 'organizers',
    inherit_audience: false,
    sort_key: '',
    tags: [],
    rev: 1,
    created_by: null,
    created_at: '',
    updated_by: null,
    updated_at: '',
    deleted_by: null,
    deleted_at: null,
    ...extra,
  };
}

describe('print HTML', () => {
  it('escapes text and fills {fields}', () => {
    expect(escapeHtml('<b>"Ať"</b> & \'já\'')).toBe(
      '&lt;b&gt;&quot;Ať&quot;&lt;/b&gt; &amp; &#39;já&#39;',
    );
    expect(fillFields('Pan {jmeno} z č. {dum} ({neznamo})', { jmeno: 'Ondřej', dum: '4' })).toBe(
      'Pan Ondřej z č. 4 ({neznamo})',
    );
    expect(textHtml('A\nB\n\n<C>')).toBe('<p>A<br>B</p><p>&lt;C&gt;</p>');
  });

  it('renders rich text with marks, links as labels, and fields', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Vyhláška' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Pro {jmeno}: ', marks: [{ type: 'bold' }] },
            { type: 'wikiLink', attrs: { id: 'x', label: 'Lipnov <1>' } },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
            },
          ],
        },
        { type: 'paragraph' },
      ],
    };
    expect(richHtml(doc, { jmeno: 'Hana' })).toBe(
      '<h2>Vyhláška</h2><p><strong>Pro Hana: </strong>Lipnov &lt;1&gt;</p><ul><li><p>a</p></li></ul><p>&nbsp;</p>',
    );
  });

  it('gives each size and paper its own named page and loads only the fonts used', () => {
    const html = printHtml([
      {
        size: 'A5',
        look: { fontId: 'caveat', ink: '#223355', paper: 'aged', sizePt: 14 },
        strip: 'ORG <č. 1>',
        html: '<p>x</p>',
      },
      {
        size: 'A4',
        look: { fontId: 'caveat', ink: '#000000', paper: 'plain', sizePt: 12 },
        html: '<p>y</p>',
      },
    ]);
    expect(html).toContain('@page p_A5_aged{size:A5;margin:0;background:#f3ead6}');
    expect(html).toContain('@page p_A4_plain{size:A4;margin:0;background:#ffffff}');
    expect(html).toContain('ORG &lt;č. 1&gt;');
    expect(html).toContain('url("app://print/fonts/caveat.ttf")');
    expect(html).not.toContain('eb-garamond.ttf');
    expect(html.match(/<section/g)).toHaveLength(2);
  });
});

describe('booklets', () => {
  it('pads to a multiple of four and pairs pages for folding', () => {
    expect(bookletPageCount(1)).toBe(4);
    expect(bookletPageCount(9)).toBe(12);
    expect(bookletSheets(8)).toEqual([
      { front: { left: 8, right: 1 }, back: { left: 2, right: 7 } },
      { front: { left: 6, right: 3 }, back: { left: 4, right: 5 } },
    ]);
    expect(bookletOrder(6)).toEqual([0, 1, 2, 0, 6, 3, 4, 5]);
  });
});

describe('archive', () => {
  it('writes shelf marks in Roman numerals', () => {
    expect([1, 4, 9, 14, 40, 1994].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'MCMXCIV']);
    expect(shelfMark(4, 7)).toBe('IV/7');
    expect(pageRange({ firstPage: 3, lastPage: 3 })).toBe('3');
    expect(pageRange({ firstPage: 3, lastPage: 5 })).toBe('3–5');
  });

  it('numbers new parts after the printed ones without renumbering them', () => {
    const a = rec('archive_part', 'Kronika', {
      section: 1,
      item: 1,
      printed: { first_page: 1, last_page: 4, at: 'x' },
    });
    const b = rec('archive_part', 'Listina', {
      section: 1,
      item: 3,
      printed: { first_page: 5, last_page: 5, at: 'x' },
    });
    // Added later, but sorted before b by shelf mark: still numbered after 5.
    const c = rec('archive_part', 'Dodatek', { section: 1, item: 2 });
    const d = rec('archive_part', 'Mapa', { section: 2, item: 1 });
    const placed = placeParts(
      [d, b, c, a],
      new Map([
        [c.id, 2],
        [d.id, 3],
      ]),
    );
    expect(
      placed.map((part) => [part.shelfMark, part.firstPage, part.lastPage, part.printed]),
    ).toEqual([
      ['I/1', 1, 4, true],
      ['I/2', 6, 7, false],
      ['I/3', 5, 5, true],
      ['II/1', 8, 10, false],
    ]);
    expect(nextItem([a, b, c, d], 1)).toBe(4);
    expect(nextItem([a, b, c, d], 3)).toBe(1);
  });
});

describe('documents', () => {
  it('numbers, orders and selects documents', () => {
    expect(['10', '2', '10a', '1'].sort(compareNumbers)).toEqual(['1', '2', '10', '10a']);
    const p1 = rec('phase', 'I', { order: 1 });
    const p0 = rec('phase', '0', { order: 0 });
    const docs = [
      rec('prop_document', 'c', {
        number: '3',
        phase_id: p1.id,
        delivery_order: 0,
        character_ids: ['h'],
      }),
      rec('prop_document', 'a', { number: '12a', phase_id: p0.id, delivery_order: 2 }),
      rec('prop_document', 'b', {
        number: '12',
        phase_id: p0.id,
        delivery_order: 2,
        character_ids: ['h'],
      }),
      rec('prop_document', 'd', { number: '1' }),
    ];
    expect(sortForDelivery(docs, [p1, p0]).map((row) => row.title)).toEqual(['b', 'a', 'c', 'd']);
    expect(selectDocuments(docs, { characterId: 'h' }).map((row) => row.title)).toEqual(['c', 'b']);
    expect(selectDocuments(docs, { phaseId: p0.id }).map((row) => row.title)).toEqual(['a', 'b']);
    expect(nextNumber(docs)).toBe('13');
    expect(
      duplicateNumbers([...docs, rec('prop_document', 'e', { number: '3' })]).get('3'),
    ).toHaveLength(2);
  });

  it('finds references to numbered documents, and the checker flags missing ones', () => {
    expect(
      referencedNumbers('Viz dopis č. 12, nařízení číslo 3 a Dopisu č.7a. Dům č. 4 ne.'),
    ).toEqual(['12', '3', '7a']);
    const records = [
      rec('prop_document', 'Dopis', { number: '12' }),
      rec('page', 'Kronika', { body: 'Jak píše dopis č. 12 a vyhláška č. 40…' }),
    ];
    const findings = checkConsistency(records).filter((f) => f.type === 'missing_document');
    expect(findings).toEqual([expect.objectContaining({ number: '40' })]);
  });
});

describe('mail-merge fields', () => {
  it('fills character fields from the roster', () => {
    const faction = rec('faction', 'Lipnovští');
    const race = rec('definition', 'Člověk', { type: 'race' });
    const skill = rec('definition', 'Bylinkářství', { type: 'skill' });
    const character = rec('character', 'Hraběnka', {
      post: 'správkyně',
      house_number: '4',
      faction_ids: [faction.id],
      definition_ids: [race.id, skill.id],
    });
    const fields = characterFields(
      character,
      new Map([faction, race, skill].map((row) => [row.id, row])),
      [
        {
          id: 'p',
          team_id: 't',
          display_name: 'Hana Hráčka',
          user_id: null,
          created_at: '',
          updated_at: '',
          deleted_at: null,
        },
      ],
      [
        {
          record_id: character.id,
          team_id: 't',
          person_id: 'p',
          relation: 'player',
          updated_at: '',
        },
      ],
    );
    expect(fields).toEqual({
      jmeno: 'Hraběnka',
      hrac: 'Hana Hráčka',
      funkce: 'správkyně',
      dum: '4',
      skupiny: 'Lipnovští',
      rasa: 'Člověk',
      dovednosti: 'Bylinkářství',
    });
  });
});

describe('Word output', () => {
  it('writes one section per document with the strip, font and filled fields', async () => {
    const { unzipSync, strFromU8 } = await import('fflate');
    const { buildDocx } = await import('./docx');
    const bytes = await buildDocx([
      {
        size: 'A5',
        fontId: 'caveat',
        ink: '#223355',
        sizePt: 14,
        strip: 'ORG č. 12',
        letterhead: 'Rychta Lipnov',
        date: 'L. P. 1621',
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Milý {jmeno},', marks: [{ type: 'bold' }] }],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'obilí' }] }],
                },
              ],
            },
          ],
        },
        signature: 'Rychtář',
        fields: { jmeno: 'Ondřeji' },
      },
      {
        size: 'A4',
        fontId: 'eb-garamond',
        ink: '#000000',
        sizePt: 12,
        body: { type: 'doc', content: [] },
      },
    ]);
    const xml = strFromU8(unzipSync(bytes)['word/document.xml'] ?? new Uint8Array());
    expect(xml).toContain('Milý Ondřeji,');
    expect(xml).toContain('ORG č. 12');
    expect(xml).toContain('w:ascii="Caveat"');
    expect(xml).toContain('w:color w:val="223355"');
    expect(xml.match(/<w:sectPr/g)).toHaveLength(2);
  });
});

describe('print HTML attributes', () => {
  it('keeps the inline style intact (no double quotes inside the attribute)', () => {
    const html = printHtml([
      {
        size: 'A4',
        look: { fontId: 'grenze-gotisch', ink: '#000000', paper: 'plain', sizePt: 14 },
        html: '',
      },
    ]);
    const style = /<section class="piece [^"]*" style="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(style).toContain("font-family:'Zazemi Grenze Gotisch',serif");
    expect(style).toContain('font-size:14pt');
  });
});
