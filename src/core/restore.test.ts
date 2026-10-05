import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildBackup } from './backup';
import type { RecordRow } from './model';
import { backupFile, planRestore } from './restore';

const teamId = randomUUID();
const hana = { id: randomUUID(), display_name: 'Hana Hráčka' };

function rec(kind: string, title: string, extra: Partial<RecordRow> = {}): RecordRow {
  return {
    id: randomUUID(),
    team_id: teamId,
    kind,
    world_id: null,
    game_id: null,
    parent_id: null,
    title,
    data: {},
    visibility: 'organizers',
    inherit_audience: false,
    sort_key: '',
    tags: [],
    rev: 3,
    created_by: null,
    created_at: '2026-10-05T10:00:00Z',
    updated_by: null,
    updated_at: '2026-10-05T10:00:00Z',
    deleted_by: null,
    deleted_at: null,
    ...extra,
  };
}

const world = rec('world', 'Pohraničí');
const game = rec('game', 'Pevnost', { world_id: world.id });
const page = rec('page', 'Lipnov', { game_id: game.id });
const character = rec('character', 'Hraběnka', {
  game_id: game.id,
  data: { notes: { type: 'doc', content: [{ type: 'wikiLink', attrs: { id: page.id } }] } },
});
const folder = rec('folder', 'Dopisy', { game_id: game.id });
const file = rec('file', 'Dopis.docx', {
  game_id: game.id,
  parent_id: folder.id,
  data: { current_version_id: randomUUID(), current_version_no: 2, size: 10 },
});
const empty = rec('file', 'Prázdný.docx', { game_id: game.id });

const backup = backupFile.parse(
  buildBackup({
    appVersion: '0.8.0',
    exportedAt: new Date(),
    team: { id: teamId, name: 'Spolek Lipnov' },
    tables: {
      people: [{ ...hana, team_id: teamId, user_id: null }],
      records: [file, character, empty, page, folder, game, world],
      record_secrets: [
        {
          record_id: character.id,
          team_id: teamId,
          data: { truth: page.id },
          rev: 1,
          updated_by: null,
          updated_at: '',
        },
      ],
      record_access: [],
      record_people: [
        {
          record_id: character.id,
          team_id: teamId,
          person_id: hana.id,
          relation: 'player',
          updated_at: '',
        },
      ],
    },
  }),
);

let counter = 0;
const newId = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

describe('planRestore', () => {
  it('puts back only what the same team is missing, containers first', () => {
    const plan = planRestore(backup, {
      teamId,
      recordIds: new Set([world.id, game.id]),
      people: [hana],
      registrationIds: new Set(),
      newId,
    });
    expect(plan.sameTeam).toBe(true);
    expect(plan.existing).toBe(2);
    expect(plan.people).toEqual([]);
    const order = plan.records.map((row) => row.title);
    expect(order).not.toContain('Prázdný.docx');
    expect(order.indexOf('Dopisy')).toBeLessThan(order.indexOf('Dopis.docx'));
    expect(plan.records.find((row) => row.title === 'Dopis.docx')?.data).toEqual({ size: 10 });
    expect(plan.records.find((row) => row.title === 'Hraběnka')?.id).toBe(character.id);
    expect(plan.files).toEqual([{ recordId: file.id, entry: `soubory/${file.id}` }]);
    expect(plan.missingFiles).toBe(1);
    expect(plan.recordPeople).toEqual([
      { record_id: character.id, person_id: hana.id, relation: 'player' },
    ]);
  });

  it('gives everything new ids in another team and keeps references intact', () => {
    const otherHana = { id: randomUUID(), display_name: 'Hana Hráčka' };
    const plan = planRestore(backup, {
      teamId: randomUUID(),
      recordIds: new Set(),
      people: [otherHana],
      registrationIds: new Set(),
      newId,
    });
    expect(plan.sameTeam).toBe(false);
    expect(plan.records.map((row) => row.kind).slice(0, 2)).toEqual(['world', 'game']);
    const ids = new Set([world.id, game.id, page.id, character.id, folder.id, file.id]);
    for (const row of plan.records) expect(ids.has(row.id)).toBe(false);
    const newGame = plan.records.find((row) => row.kind === 'game');
    const newWorld = plan.records.find((row) => row.kind === 'world');
    const newPage = plan.records.find((row) => row.kind === 'page');
    const newCharacter = plan.records.find((row) => row.kind === 'character');
    expect(newGame?.world_id).toBe(newWorld?.id);
    expect(newPage?.game_id).toBe(newGame?.id);
    expect(JSON.stringify(newCharacter?.data)).toContain(newPage?.id);
    expect(plan.secrets[0]).toEqual({ record_id: newCharacter?.id, data: { truth: newPage?.id } });
    // Hana exists in the new team under the same name: attach to her.
    expect(plan.people).toEqual([]);
    expect(plan.recordPeople[0]?.person_id).toBe(otherHana.id);
  });

  it('adds people who are not in the new team yet', () => {
    const plan = planRestore(backup, {
      teamId: randomUUID(),
      recordIds: new Set(),
      people: [],
      registrationIds: new Set(),
      newId,
    });
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0]?.display_name).toBe('Hana Hráčka');
    expect(plan.recordPeople[0]?.person_id).toBe(plan.people[0]?.id);
  });
});
