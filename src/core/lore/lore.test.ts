import { describe, expect, it } from 'vitest';
import type { RecordRow } from '../model';
import { dataLinks, docText, richDoc, textToDoc } from '../richtext';
import { phaseChecklist } from './checklist';
import { cloneGame, remapIds } from './clone';
import { checkConsistency, editDistance, similarStems } from './consistency';
import { compareSections, diffWords } from './diff';
import { threadReach, unreachableThreads } from './plots';

let next = 0;
function rec(
  kind: string,
  title: string,
  data: Record<string, unknown> = {},
  extra: Partial<RecordRow> = {},
): RecordRow {
  next += 1;
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
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
    created_at: '2026-10-05T10:00:00Z',
    updated_by: null,
    updated_at: '2026-10-05T10:00:00Z',
    deleted_by: null,
    deleted_at: null,
    ...extra,
  };
}

function link(id: string, label: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Viz ' },
          { type: 'wikiLink', attrs: { id, label } },
          { type: 'text', text: '.' },
        ],
      },
    ],
  };
}

describe('rich text', () => {
  it('reads text and links, and turns plain strings into documents', () => {
    const doc = link('abc', 'Lipnov');
    expect(docText(doc)).toBe('Viz Lipnov.');
    expect(dataLinks({ body: doc, other: [link('def', 'Tvrz')] })).toEqual(['abc', 'def']);
    expect(docText(richDoc.parse('První\nDruhý'))).toBe('První\nDruhý');
    expect(richDoc.parse(undefined)).toEqual({ type: 'doc', content: [] });
    expect(richDoc.parse(42)).toEqual({ type: 'doc', content: [] });
    expect(textToDoc('').content).toHaveLength(1);
  });
});

describe('consistency checker', () => {
  it('measures edits with transpositions', () => {
    expect(editDistance('lipnov', 'lipnvo')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(similarStems('lipnov', 'lipnic')).toBe(true);
    expect(similarStems('pevnost', 'pevnin')).toBe(false);
    expect(similarStems('hrad', 'hrad')).toBe(false);
  });

  it('finds duplicate and confusingly similar names', () => {
    const records = [
      rec('page', 'Lipnov'),
      rec('page', 'Lipnice'),
      rec('character', 'Kovář Ondřej'),
      rec('npc', 'Kovář ondřej'),
      rec('npc', 'Voják 1'),
      rec('npc', 'Voják 2'),
      rec('relationship', 'Lipnovan'),
    ];
    const findings = checkConsistency(records);
    expect(findings.filter((f) => f.type === 'duplicate_name')).toHaveLength(1);
    const similar = findings.filter((f) => f.type === 'similar_names');
    expect(similar).toHaveLength(1);
    expect(similar[0]).toMatchObject({ words: ['Lipnov', 'Lipnice'] });
  });

  it('reports links to deleted or trashed records', () => {
    const gone = rec('page', 'Stará tvrz', {}, { deleted_at: '2026-10-05T11:00:00Z' });
    const page = rec('page', 'Kronika', { body: link(gone.id, 'Stará tvrz') });
    const other = rec('page', 'Dopis', {
      body: link('99999999-0000-4000-8000-000000000000', 'Nikdo'),
    });
    const findings = checkConsistency([gone, page, other]).filter(
      (f) => f.type === 'dangling_link',
    );
    expect(findings).toEqual([
      expect.objectContaining({ from_id: page.id, trashed: true, label: 'Stará tvrz' }),
      expect.objectContaining({ from_id: other.id, trashed: false }),
    ]);
  });

  it('compares canon facts with characters and with each other', () => {
    const hrabenka = rec('character', 'Hraběnka z Lipnova', {
      house_number: '7',
      post: 'správkyně',
    });
    const records = [
      hrabenka,
      rec('canon_entry', 'Dům hraběnky', {
        subject_id: hrabenka.id,
        field: 'house_number',
        value: '4',
      }),
      rec('canon_entry', 'Funkce', { subject_id: hrabenka.id, field: 'post', value: 'Správkyně' }),
      rec('canon_entry', 'Věk', { subject_name: 'Rychtář', field: 'age', value: '52' }),
      rec('canon_entry', 'Věk znovu', { subject_name: 'rychtář', field: 'age', value: '61' }),
      rec('canon_entry', 'Ztracený', {
        subject_id: '99999999-0000-4000-8000-000000000001',
        field: 'title',
        value: 'X',
      }),
    ];
    const findings = checkConsistency(records);
    expect(findings.filter((f) => f.type === 'canon_conflict')).toEqual([
      expect.objectContaining({ expected: '4', actual: '7', subject_id: hrabenka.id }),
    ]);
    expect(findings.filter((f) => f.type === 'canon_contradiction')).toEqual([
      expect.objectContaining({ values: ['52', '61'] }),
    ]);
    expect(findings.filter((f) => f.type === 'canon_missing_subject')).toHaveLength(1);
  });
});

describe('phase checklist', () => {
  it('collects what the phase needs, with state from each record', () => {
    const phase = rec('phase', 'Fáze I', {
      tasks: [{ id: 't1', text: 'Koupit svíčky', done: true }],
    });
    const otherPhase = rec('phase', 'Fáze II');
    const block = rec('block', 'Večer', { phase_id: phase.id });
    const records = [
      phase,
      otherPhase,
      block,
      rec('npc_appearance', 'Voják: hlídka', { block_id: block.id, prep_status: 'done' }),
      rec('npc_appearance', 'Rychtář', { block_id: null }),
      rec('beat', 'Provolání', { phase_id: phase.id, at: '2027-05-14T19:00', done: false }),
      rec('beat', 'Zvonění', { block_id: block.id, at: '2027-05-14T18:00' }),
      rec('clue', 'Dopis v truhle', { phase_id: phase.id, status: 'planned', location: 'sklep' }),
      rec('clue', 'Škrtnutá stopa', { phase_id: phase.id, status: 'cut' }),
      rec('quest', 'Najít kozu', { phase_id: phase.id, status: 'open' }),
      rec('quest', 'Jinde', { phase_id: otherPhase.id }),
    ];
    const items = phaseChecklist(phase, records);
    expect(items.map((item) => [item.type, item.title, item.done])).toEqual([
      ['appearance', 'Voják: hlídka', true],
      ['beat', 'Zvonění', false],
      ['beat', 'Provolání', false],
      ['clue', 'Dopis v truhle', false],
      ['quest', 'Najít kozu', true],
      ['task', 'Koupit svíčky', true],
    ]);
  });
});

describe('plot threads', () => {
  it('flags threads in play that no reachable clue leads to', () => {
    const open = rec('plot_thread', 'Ztracený prsten', { status: 'active' });
    const covered = rec('plot_thread', 'Pašeráci', { status: 'active' });
    const done = rec('plot_thread', 'Stará křivda', { status: 'resolved' });
    const records = [
      open,
      covered,
      done,
      rec('clue', 'Nikde', { thread_ids: [open.id], status: 'planned' }),
      rec('clue', 'Škrtnutá', { thread_ids: [open.id], location: 'mlýn', status: 'cut' }),
      rec('clue', 'U mlynáře', { thread_ids: [covered.id], location: 'mlýn' }),
    ];
    expect(unreachableThreads(records)).toEqual([open.id]);
    expect(threadReach(records).get(open.id)).toEqual({ clues: 2, reachable: 0 });
  });
});

describe('rulebook diff', () => {
  it('diffs words and restores both texts', () => {
    const before = 'Boj probíhá na dotek. Zranění se hlásí.';
    const after = 'Boj probíhá na lehký dotek. Zranění se hlásí nahlas.';
    const parts = diffWords(before, after);
    expect(
      parts
        .filter((part) => part.type !== 'insert')
        .map((part) => part.text)
        .join(''),
    ).toBe(before);
    expect(
      parts
        .filter((part) => part.type !== 'delete')
        .map((part) => part.text)
        .join(''),
    ).toBe(after);
    expect(parts.filter((part) => part.type === 'insert').map((part) => part.text.trim())).toEqual([
      'lehký',
      'nahlas',
    ]);
    expect(parts.filter((part) => part.type === 'delete')).toEqual([]);
    expect(diffWords('', 'nový text')).toEqual([{ type: 'insert', text: 'nový text' }]);
    expect(diffWords('stejné', 'stejné')).toEqual([{ type: 'equal', text: 'stejné' }]);
  });

  it('compares sections by id', () => {
    const changes = compareSections(
      [
        { id: 'a', title: 'Boj', text: 'Na dotek.' },
        { id: 'b', title: 'Magie', text: 'Kouzla.' },
        { id: 'c', title: 'Obchod', text: 'Groše.' },
      ],
      [
        { id: 'a', title: 'Boj', text: 'Na dotek.' },
        { id: 'c', title: 'Obchod a peníze', text: 'Groše a krejcary.' },
        { id: 'd', title: 'Bezpečnost', text: 'Stopka.' },
      ],
    );
    expect(changes.map((change) => [change.status, change.id])).toEqual([
      ['unchanged', 'a'],
      ['changed', 'c'],
      ['added', 'd'],
      ['removed', 'b'],
    ]);
  });
});

describe('cloneGame', () => {
  it('copies the game with new ids and remaps every reference', () => {
    const game = rec(
      'game',
      'Pevnost I',
      { status: 'finished', starts_on: '2026-05-01' },
      { world_id: 'w' },
    );
    const inGame = { world_id: 'w', game_id: game.id };
    const a = rec('character', 'Hraběnka', { faction_ids: [] }, inGame);
    const b = rec('character', 'Kovář', {}, inGame);
    const tie = rec('relationship', 'Hraběnka → Kovář', { from_id: a.id, to_id: b.id }, inGame);
    const page = rec('page', 'Kronika', { body: link(a.id, 'Hraběnka') }, inGame);
    const hook = rec('hook', 'Dluh', {}, { ...inGame, parent_id: a.id });
    const folder = rec('folder', 'Dokumenty', {}, inGame);
    const file = rec('file', 'Dopis.docx', {}, { ...inGame, parent_id: folder.id });
    const trashed = rec('page', 'Smazáno', {}, { ...inGame, deleted_at: '2026-10-05T11:00:00Z' });
    const elsewhere = rec('character', 'Jiná hra', {}, { world_id: 'w', game_id: 'other' });
    let counter = 0;
    const result = cloneGame(
      game,
      [game, a, b, tie, page, hook, folder, file, trashed, elsewhere],
      {
        secrets: [
          {
            record_id: a.id,
            team_id: 'team',
            data: { sections: { notes: b.id } },
            rev: 1,
            updated_by: null,
            updated_at: '',
          },
        ],
        access: [],
        people: [
          { record_id: a.id, team_id: 'team', person_id: 'p1', relation: 'player', updated_at: '' },
        ],
      },
      { title: 'Pevnost II', keepPeople: false },
      () => `new-${String((counter += 1))}`,
    );
    const titles = result.records.map((row) => row.title);
    expect(titles[0]).toBe('Pevnost II');
    expect(titles.sort()).toEqual([
      'Dluh',
      'Hraběnka',
      'Hraběnka → Kovář',
      'Kovář',
      'Kronika',
      'Pevnost II',
    ]);
    const newGame = result.records[0];
    expect(newGame?.data).toMatchObject({ status: 'planning', starts_on: null });
    const byTitle = (title: string) => result.records.find((row) => row.title === title);
    const newA = result.ids.get(a.id);
    expect(byTitle('Hraběnka → Kovář')?.data).toEqual({
      from_id: newA,
      to_id: result.ids.get(b.id),
    });
    expect(dataLinks(byTitle('Kronika')?.data)).toEqual([newA]);
    expect(byTitle('Dluh')?.parent_id).toBe(newA);
    expect(byTitle('Kovář')?.game_id).toBe(newGame?.id);
    // The hook comes after its character.
    expect(result.records.findIndex((row) => row.title === 'Dluh')).toBeGreaterThan(
      result.records.findIndex((row) => row.title === 'Hraběnka'),
    );
    expect(result.secrets).toEqual([
      { record_id: newA, data: { sections: { notes: result.ids.get(b.id) } } },
    ]);
    expect(result.people).toEqual([]);
  });

  it('remaps nested values but leaves other strings alone', () => {
    const ids = new Map([['x', 'y']]);
    expect(remapIds({ a: ['x', 'z'], b: { c: 'x' }, d: 1 }, ids)).toEqual({
      a: ['y', 'z'],
      b: { c: 'y' },
      d: 1,
    });
  });
});
