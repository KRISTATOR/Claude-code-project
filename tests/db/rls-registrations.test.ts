import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTeam, insertRecord, type TeamFixture } from './fixtures';
import { openTestDb, type TestDb } from './harness';

/** Registrations are personal data: organizers see all, a person only their own. */
let db: TestDb;
let team: TeamFixture;
let other: TeamFixture;
let game: string;
let character: string;
let mine: string;
let theirs: string;
let unlinked: string;

async function register(person: string | null, name: string): Promise<string> {
  const rows = await db.as<{ id: string }>(
    team.organizer,
    `insert into public.registrations (team_id, game_id, person_id, name, allergies, emergency_contact)
     values ($1, $2, $3, $4, 'ořechy', 'Matka, 600 000 000') returning id`,
    [team.teamId, game, person, name],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('insert failed');
  return id;
}

const visible = async (user: string) =>
  (await db.as<{ id: string }>(user, 'select id from public.registrations')).map((row) => row.id);

beforeAll(async () => {
  db = await openTestDb();
  team = await createTeam(db);
  other = await createTeam(db);
  const world = await insertRecord(db, team, { kind: 'world', visibility: 'everyone' });
  game = await insertRecord(db, team, { kind: 'game', world_id: world, visibility: 'everyone' });
  character = await insertRecord(db, team, { kind: 'character', game_id: game });
  mine = await register(team.person.player1, 'Hana Hráčka');
  theirs = await register(team.person.player2, 'Ivo Hráč');
  unlinked = await register(null, 'Lída Přihlášená');
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('registrations', () => {
  it('organizers read every registration of their team', async () => {
    const ids = await visible(team.organizer2);
    expect(ids.sort()).toEqual([mine, theirs, unlinked].sort());
  });

  it('a player reads only their own registration', async () => {
    expect(await visible(team.player1)).toEqual([mine]);
    expect(await visible(team.player2)).toEqual([theirs]);
    expect(await visible(team.npc)).toEqual([]);
  });

  it('outsiders, another team and anonymous users read nothing', async () => {
    expect(await visible(team.outsider)).toEqual([]);
    expect(await visible(other.organizer)).toEqual([]);
    await expect(db.as(null, 'select * from public.registrations')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('players cannot insert, update or delete directly', async () => {
    await expect(
      db.as(
        team.player1,
        `insert into public.registrations (team_id, game_id, name) values ($1, $2, 'x')`,
        [team.teamId, game],
      ),
    ).rejects.toThrow(/row-level security/);
    const updated = await db.as(
      team.player1,
      `update public.registrations set status = 'paid' where id = $1 returning id`,
      [mine],
    );
    expect(updated).toHaveLength(0);
    const deleted = await db.as(
      team.player1,
      'delete from public.registrations where id = $1 returning id',
      [mine],
    );
    expect(deleted).toHaveLength(0);
  });

  it('a player updates their own allergies and emergency contact through the function', async () => {
    await db.as(team.player1, 'select public.update_my_registration($1, $2, $3, $4)', [
      mine,
      ['gluten', 'nuts'],
      'bez lepku',
      'Otec, 700 000 000',
    ]);
    const rows = await db.as<{
      allergens: string[];
      allergies: string;
      emergency_contact: string;
      status: string;
      rev: number;
    }>(
      team.player1,
      'select allergens, allergies, emergency_contact, status, rev from public.registrations where id = $1',
      [mine],
    );
    expect(rows[0]).toEqual({
      allergens: ['gluten', 'nuts'],
      allergies: 'bez lepku',
      emergency_contact: 'Otec, 700 000 000',
      status: 'applied',
      rev: 2,
    });
  });

  it("the function refuses someone else's registration", async () => {
    for (const [user, id] of [
      [team.player1, theirs],
      [team.player1, unlinked],
      [team.outsider, mine],
      [other.organizer, mine],
    ] as const) {
      await expect(
        db.as(user, 'select public.update_my_registration($1, $2, $3, $4)', [id, [], '', '']),
      ).rejects.toThrow(/not your registration/);
    }
  });

  it('organizers edit, link a character and hard-delete', async () => {
    const rows = await db.as<{ rev: number }>(
      team.organizer,
      `update public.registrations set status = 'assigned', character_id = $2 where id = $1 returning rev`,
      [theirs, character],
    );
    expect(rows[0]?.rev).toBe(2);
    const deleted = await db.as(
      team.organizer,
      'delete from public.registrations where id = $1 returning id',
      [unlinked],
    );
    expect(deleted).toHaveLength(1);
    expect(await db.admin('select 1 from public.registrations where id = $1', [unlinked])).toEqual(
      [],
    );
  });

  it('the game, character and person must belong to the same team', async () => {
    const foreignWorld = await insertRecord(db, other, { kind: 'world' });
    const foreignGame = await insertRecord(db, other, { kind: 'game', world_id: foreignWorld });
    await expect(
      db.as(
        other.organizer,
        `insert into public.registrations (team_id, game_id, name) values ($1, $2, 'x')`,
        [other.teamId, game],
      ),
    ).rejects.toThrow(/game_id/);
    await expect(
      db.as(
        other.organizer,
        `insert into public.registrations (team_id, game_id, person_id, name) values ($1, $2, $3, 'x')`,
        [other.teamId, foreignGame, team.person.player1],
      ),
    ).rejects.toThrow(/person_id/);
    await expect(
      db.as(
        other.organizer,
        `insert into public.registrations (team_id, game_id, character_id, name) values ($1, $2, $3, 'x')`,
        [other.teamId, foreignGame, character],
      ),
    ).rejects.toThrow(/character_id/);
    await expect(
      db.as(
        team.organizer,
        `insert into public.registrations (team_id, game_id, name) values ($1, $2, 'x')`,
        [other.teamId, foreignGame],
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
