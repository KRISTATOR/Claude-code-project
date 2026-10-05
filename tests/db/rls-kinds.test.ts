import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attach, canSee, createTeam, insertRecord, type TeamFixture } from './fixtures';
import { openTestDb, type TestDb } from './harness';

/**
 * CLAUDE.md hard rule 7: every record kind gets these four checks. New kinds
 * are added to the lists below.
 */
const gameKinds = [
  'character',
  'character_profile',
  'sheet_template',
  'faction',
  'relationship',
  'npc',
  'npc_appearance',
  'phase',
  'block',
  'file',
  'folder',
];
const worldKinds = ['definition', 'faction'];
/** Kinds a person is attached to (rule R4) and how. */
const attachable: Record<string, 'player' | 'actor'> = { character: 'player', npc: 'actor' };

let db: TestDb;
let team: TeamFixture;
let world: string;
let game: string;

beforeAll(async () => {
  db = await openTestDb();
  team = await createTeam(db);
  world = await insertRecord(db, team, { kind: 'world', visibility: 'everyone' });
  game = await insertRecord(db, team, { kind: 'game', world_id: world, visibility: 'everyone' });
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe.each(gameKinds)('kind %s (organizers only by default)', (kind) => {
  it('is readable by organizers, not by other players, NPC actors or outsiders', async () => {
    const id = await insertRecord(db, team, { kind, game_id: game });
    expect(await canSee(db, team.organizer2, id)).toBe(true);
    expect(await canSee(db, team.player2, id)).toBe(false);
    expect(await canSee(db, team.npc, id)).toBe(false);
    expect(await canSee(db, team.outsider, id)).toBe(false);
  });

  const relation = attachable[kind];
  if (relation) {
    it(`is readable by the attached ${relation}, still not by others`, async () => {
      const id = await insertRecord(db, team, { kind, game_id: game });
      const person = relation === 'player' ? team.person.player1 : team.person.npc;
      const user = relation === 'player' ? team.player1 : team.npc;
      await attach(db, team, id, person, relation);
      expect(await canSee(db, user, id)).toBe(true);
      expect(await canSee(db, team.player2, id)).toBe(false);
    });
  }
});

describe.each(worldKinds)('world-level kind %s', (kind) => {
  it('follows its visibility within the world', async () => {
    const hidden = await insertRecord(db, team, { kind, world_id: world });
    const shared = await insertRecord(db, team, { kind, world_id: world, visibility: 'everyone' });
    expect(await canSee(db, team.player1, hidden)).toBe(false);
    expect(await canSee(db, team.player1, shared)).toBe(true);
    expect(await canSee(db, team.outsider, shared)).toBe(false);
  });
});

describe('NPC appearances', () => {
  it('an actor attached to one appearance sees it but not the NPC’s other appearances', async () => {
    const npc = await insertRecord(db, team, { kind: 'npc', game_id: game });
    const mine = await insertRecord(db, team, {
      kind: 'npc_appearance',
      game_id: game,
      parent_id: npc,
      inherit_audience: true,
    });
    const other = await insertRecord(db, team, {
      kind: 'npc_appearance',
      game_id: game,
      parent_id: npc,
      inherit_audience: true,
    });
    await attach(db, team, mine, team.person.npc, 'actor');
    expect(await canSee(db, team.npc, mine)).toBe(true);
    expect(await canSee(db, team.npc, other)).toBe(false);
    expect(await canSee(db, team.npc, npc)).toBe(false);
  });
});
