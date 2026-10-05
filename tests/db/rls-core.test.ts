import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attach, canSee, createTeam, insertRecord, type TeamFixture } from './fixtures';
import { createUser, openTestDb, type TestDb } from './harness';

let db: TestDb;
let team: TeamFixture;
let world: string;
let game: string;

beforeAll(async () => {
  db = await openTestDb();
  team = await createTeam(db);
  world = await insertRecord(db, team, {
    kind: 'world',
    title: 'Pohraničí',
    visibility: 'everyone',
  });
  game = await insertRecord(db, team, {
    kind: 'game',
    title: 'Pevnost na hranici',
    world_id: world,
    visibility: 'everyone',
  });
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('character sheets (rule R4)', () => {
  it('a player reads their own sheet but not another player’s', async () => {
    const sheet1 = await insertRecord(db, team, {
      kind: 'character',
      title: 'Postava 1',
      game_id: game,
    });
    const sheet2 = await insertRecord(db, team, {
      kind: 'character',
      title: 'Postava 2',
      game_id: game,
    });
    await attach(db, team, sheet1, team.person.player1, 'player');
    await attach(db, team, sheet2, team.person.player2, 'player');

    expect(await canSee(db, team.player1, sheet1)).toBe(true);
    expect(await canSee(db, team.player1, sheet2)).toBe(false);
    expect(await canSee(db, team.player2, sheet2)).toBe(true);
    expect(await canSee(db, team.player2, sheet1)).toBe(false);
    expect(await canSee(db, team.npc, sheet1)).toBe(false);
    expect(await canSee(db, team.organizer2, sheet1)).toBe(true);
  });

  it('a player never reads organizer-only fields, even of their own character', async () => {
    const sheet = await insertRecord(db, team, { kind: 'character', game_id: game });
    await attach(db, team, sheet, team.person.player1, 'player');
    await db.as(
      team.organizer,
      `insert into public.record_secrets (record_id, team_id, data) values ($1, $2, '{"fate":"zemře ve IV. fázi"}')`,
      [sheet, team.teamId],
    );
    const forPlayer = await db.as(
      team.player1,
      'select * from public.record_secrets where record_id = $1',
      [sheet],
    );
    const forOrganizer = await db.as(
      team.organizer2,
      'select * from public.record_secrets where record_id = $1',
      [sheet],
    );
    expect(forPlayer).toHaveLength(0);
    expect(forOrganizer).toHaveLength(1);
  });
});

describe('organizer-only records', () => {
  it('no player, NPC actor or outsider reads them', async () => {
    const secret = await insertRecord(db, team, {
      kind: 'page',
      title: 'Pravda o hraběti',
      game_id: game,
    });
    for (const user of [team.player1, team.player2, team.npc, team.outsider]) {
      expect(await canSee(db, user, secret)).toBe(false);
    }
    expect(await canSee(db, null, secret)).toBe(false);
    expect(await canSee(db, team.organizer, secret)).toBe(true);
  });

  it('is the default visibility for new records', async () => {
    const rows = await db.as<{ visibility: string }>(
      team.organizer,
      `insert into public.records (team_id, kind, title) values ($1, 'page', 'Nová stránka') returning visibility`,
      [team.teamId],
    );
    expect(rows[0]?.visibility).toBe('organizers');
  });
});

describe('visibility everyone and specific (rules R2, R3)', () => {
  it('everyone means every team member, not outsiders', async () => {
    const page = await insertRecord(db, team, {
      kind: 'page',
      visibility: 'everyone',
      game_id: game,
    });
    for (const user of [team.player1, team.player2, team.npc])
      expect(await canSee(db, user, page)).toBe(true);
    expect(await canSee(db, team.outsider, page)).toBe(false);
    expect(await canSee(db, null, page)).toBe(false);
  });

  it('specific grants listed people and groups only', async () => {
    const page = await insertRecord(db, team, {
      kind: 'page',
      visibility: 'specific',
      game_id: game,
    });
    await db.as(
      team.organizer,
      'insert into public.record_access (record_id, team_id, person_id) values ($1, $2, $3)',
      [page, team.teamId, team.person.player1],
    );
    expect(await canSee(db, team.player1, page)).toBe(true);
    expect(await canSee(db, team.player2, page)).toBe(false);
    expect(await canSee(db, team.npc, page)).toBe(false);

    await db.as(
      team.organizer,
      `insert into public.record_access (record_id, team_id, member_role) values ($1, $2, 'npc')`,
      [page, team.teamId],
    );
    expect(await canSee(db, team.npc, page)).toBe(true);
    expect(await canSee(db, team.player2, page)).toBe(false);
  });

  it('access rows on an organizer-only record grant nothing', async () => {
    const page = await insertRecord(db, team, {
      kind: 'page',
      visibility: 'organizers',
      game_id: game,
    });
    await db.as(
      team.organizer,
      'insert into public.record_access (record_id, team_id, person_id) values ($1, $2, $3)',
      [page, team.teamId, team.person.player1],
    );
    expect(await canSee(db, team.player1, page)).toBe(false);
  });
});

describe('containers', () => {
  it('a secret game hides everything inside it, even public records and own sheets', async () => {
    const secretGame = await insertRecord(db, team, {
      kind: 'game',
      title: 'Pokračování',
      world_id: world,
    });
    const announcement = await insertRecord(db, team, {
      kind: 'page',
      visibility: 'everyone',
      game_id: secretGame,
    });
    const sheet = await insertRecord(db, team, { kind: 'character', game_id: secretGame });
    await attach(db, team, sheet, team.person.player1, 'player');

    expect(await canSee(db, team.player1, secretGame)).toBe(false);
    expect(await canSee(db, team.player1, announcement)).toBe(false);
    expect(await canSee(db, team.player1, sheet)).toBe(false);

    await db.as(team.organizer, `update public.records set visibility = 'everyone' where id = $1`, [
      secretGame,
    ]);
    expect(await canSee(db, team.player1, announcement)).toBe(true);
    expect(await canSee(db, team.player1, sheet)).toBe(true);
    expect(await canSee(db, team.player2, sheet)).toBe(false);
  });

  it('a secret world hides its games', async () => {
    const secretWorld = await insertRecord(db, team, { kind: 'world', title: 'Severská vesnice' });
    const publicGame = await insertRecord(db, team, {
      kind: 'game',
      world_id: secretWorld,
      visibility: 'everyone',
    });
    const page = await insertRecord(db, team, {
      kind: 'page',
      visibility: 'everyone',
      game_id: publicGame,
    });
    expect(await canSee(db, team.player1, publicGame)).toBe(false);
    expect(await canSee(db, team.player1, page)).toBe(false);
  });

  it('trashed records are visible to organizers only', async () => {
    const page = await insertRecord(db, team, {
      kind: 'page',
      visibility: 'everyone',
      game_id: game,
    });
    await db.as(team.organizer, 'update public.records set deleted_at = now() where id = $1', [
      page,
    ]);
    expect(await canSee(db, team.player1, page)).toBe(false);
    expect(await canSee(db, team.organizer2, page)).toBe(true);
    const rows = await db.admin<{ deleted_by: string }>(
      'select deleted_by from public.records where id = $1',
      [page],
    );
    expect(rows[0]?.deleted_by).toBe(team.organizer);
  });
});

describe('NPC actors (rules R4, R5)', () => {
  it('see their own NPC and its inheriting children, not other NPCs', async () => {
    const npcA = await insertRecord(db, team, { kind: 'npc', title: 'Desátník', game_id: game });
    const npcB = await insertRecord(db, team, { kind: 'npc', title: 'Kapitán', game_id: game });
    await attach(db, team, npcA, team.person.npc, 'actor');
    const appearanceA = await insertRecord(db, team, {
      kind: 'npc_appearance',
      game_id: game,
      parent_id: npcA,
      inherit_audience: true,
    });
    const appearanceB = await insertRecord(db, team, {
      kind: 'npc_appearance',
      game_id: game,
      parent_id: npcB,
      inherit_audience: true,
    });
    const privateNote = await insertRecord(db, team, {
      kind: 'note',
      game_id: game,
      parent_id: npcA,
    });

    expect(await canSee(db, team.npc, npcA)).toBe(true);
    expect(await canSee(db, team.npc, appearanceA)).toBe(true);
    expect(await canSee(db, team.npc, npcB)).toBe(false);
    expect(await canSee(db, team.npc, appearanceB)).toBe(false);
    expect(await canSee(db, team.npc, privateNote)).toBe(false);
    expect(await canSee(db, team.player1, appearanceA)).toBe(false);
  });
});

describe('relationships (rule R6)', () => {
  it('a one-sided relationship is hidden from the side that does not know', async () => {
    const a = await insertRecord(db, team, { kind: 'character', game_id: game });
    const b = await insertRecord(db, team, { kind: 'character', game_id: game });
    await attach(db, team, a, team.person.player1, 'player');
    await attach(db, team, b, team.person.player2, 'player');
    const secretCrush = await insertRecord(db, team, {
      kind: 'relationship',
      game_id: game,
      data: { from_id: a, to_id: b, known_by: 'from', label: 'tajně miluje' },
    });
    const mutual = await insertRecord(db, team, {
      kind: 'relationship',
      game_id: game,
      data: { from_id: a, to_id: b, known_by: 'both', label: 'sourozenci' },
    });
    expect(await canSee(db, team.player1, secretCrush)).toBe(true);
    expect(await canSee(db, team.player2, secretCrush)).toBe(false);
    expect(await canSee(db, team.player1, mutual)).toBe(true);
    expect(await canSee(db, team.player2, mutual)).toBe(true);
    expect(await canSee(db, team.npc, mutual)).toBe(false);
  });

  it('malformed ids never grant access', async () => {
    const broken = await insertRecord(db, team, {
      kind: 'relationship',
      game_id: game,
      data: { from_id: 'not-a-uuid', to_id: '', known_by: 'both' },
    });
    expect(await canSee(db, team.player1, broken)).toBe(false);
  });
});

describe('writes', () => {
  it('players and NPC actors cannot create, change or delete records', async () => {
    const page = await insertRecord(db, team, {
      kind: 'page',
      visibility: 'everyone',
      game_id: game,
    });
    for (const user of [team.player1, team.npc, team.outsider]) {
      await expect(
        db.as(user, `insert into public.records (team_id, kind, title) values ($1, 'page', 'x')`, [
          team.teamId,
        ]),
      ).rejects.toThrow(/row-level security/);
      const updated = await db.as(
        user,
        `update public.records set title = 'hacked' where id = $1 returning id`,
        [page],
      );
      expect(updated).toHaveLength(0);
      const deleted = await db.as(user, 'delete from public.records where id = $1 returning id', [
        page,
      ]);
      expect(deleted).toHaveLength(0);
    }
  });

  it('players cannot write secrets, access lists or attachments', async () => {
    const page = await insertRecord(db, team, { kind: 'page', game_id: game });
    await expect(
      db.as(
        team.player1,
        `insert into public.record_secrets (record_id, team_id) values ($1, $2)`,
        [page, team.teamId],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(
        team.player1,
        `insert into public.record_access (record_id, team_id, person_id) values ($1, $2, $3)`,
        [page, team.teamId, team.person.player1],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(
        team.player1,
        `insert into public.record_people (record_id, team_id, person_id, relation) values ($1, $2, $3, 'player')`,
        [page, team.teamId, team.person.player1],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('a player cannot change their own role', async () => {
    await expect(
      db.as(team.player1, `update public.team_members set role = 'organizer' where user_id = $1`, [
        team.player1,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as(team.player1, 'select public.set_member_role($1, $2, $3)', [
        team.teamId,
        team.player1,
        'organizer',
      ]),
    ).rejects.toThrow(/only organizers/);
  });

  it('an organizer of one team cannot write into another team', async () => {
    const other = await createTeam(db);
    await expect(
      db.as(
        team.organizer,
        `insert into public.records (team_id, kind, title) values ($1, 'page', 'x')`,
        [other.teamId],
      ),
    ).rejects.toThrow(/row-level security/);
    const otherWorld = await insertRecord(db, other, { kind: 'world' });
    await expect(
      db.as(
        team.organizer,
        `insert into public.records (team_id, kind, world_id) values ($1, 'game', $2)`,
        [team.teamId, otherWorld],
      ),
    ).rejects.toThrow(/same team/);
  });

  it('revisions and authorship are set by the server', async () => {
    const page = await insertRecord(db, team, { kind: 'page' });
    const rows = await db.as<{ rev: number; updated_by: string; created_by: string }>(
      team.organizer2,
      `update public.records set title = 'Změněno', rev = 99, created_by = $2 where id = $1
       returning rev, updated_by, created_by`,
      [page, team.player1],
    );
    expect(rows[0]).toEqual({ rev: 2, updated_by: team.organizer2, created_by: team.organizer });
  });
});

describe('membership and invites', () => {
  it('outsiders and anonymous users see no team data at all', async () => {
    for (const table of [
      'teams',
      'people',
      'team_members',
      'invites',
      'records',
      'record_history',
    ]) {
      const rows = await db.as(team.outsider, `select * from public.${table} where true`);
      const mine = rows.filter(
        (row) => (row as { team_id?: string; id?: string }).team_id === team.teamId,
      );
      expect(mine, table).toHaveLength(0);
    }
    await expect(db.as(null, 'select * from public.records')).rejects.toThrow(/permission denied/);
  });

  it('players see themselves and the organizers in the roster, nobody else', async () => {
    const rows = await db.as<{ display_name: string }>(
      team.player1,
      'select display_name from public.people where team_id = $1 order by display_name',
      [team.teamId],
    );
    expect(rows.map((row) => row.display_name)).toEqual([
      'Bára Organizátorka',
      'Hana Hráčka',
      'Kvido Organizátor',
    ]);
  });

  it('only organizers read invites and history', async () => {
    expect(
      await db.as(team.player1, 'select * from public.invites where team_id = $1', [team.teamId]),
    ).toHaveLength(0);
    expect(
      await db.as(team.player1, 'select * from public.record_history where team_id = $1', [
        team.teamId,
      ]),
    ).toHaveLength(0);
    expect(
      (
        await db.as(team.organizer2, 'select * from public.invites where team_id = $1', [
          team.teamId,
        ])
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await db.as(team.organizer2, 'select * from public.record_history where team_id = $1', [
          team.teamId,
        ])
      ).length,
    ).toBeGreaterThan(0);
  });

  it('players cannot create invites', async () => {
    await expect(
      db.as(team.player1, `select public.create_invite($1, 'organizer')`, [team.teamId]),
    ).rejects.toThrow(/only organizers/);
  });

  it('rejects expired, revoked and used-up codes, and accepts codes case-insensitively', async () => {
    const newcomer = await createUser(db, 'novy');
    const code = async (extra = '') => {
      const rows = await db.as<{ c: string }>(
        team.organizer,
        `select public.create_invite($1, 'player') as c`,
        [team.teamId],
      );
      const value = rows[0]?.c ?? '';
      if (extra) await db.admin(`update public.invites set ${extra} where code = $1`, [value]);
      return value;
    };
    const expired = await code(`expires_at = now() - interval '1 day'`);
    const revoked = await code('revoked_at = now()');
    const used = await code('use_count = 1');
    for (const bad of [expired, revoked, used, 'NEEXISTUJE-1']) {
      await expect(
        db.as(newcomer, 'select public.join_team($1, $2)', [bad, 'Nový']),
      ).rejects.toThrow(/invalid or expired/);
    }
    const good = await code();
    const joined = await db.as<{ t: string }>(newcomer, 'select public.join_team($1, $2) as t', [
      ` ${good.toLowerCase()} `,
      'Nový',
    ]);
    expect(joined[0]?.t).toBe(team.teamId);
    // The same code cannot be reused by somebody else.
    const another = await createUser(db, 'dalsi');
    await expect(
      db.as(another, 'select public.join_team($1, $2)', [good, 'Další']),
    ).rejects.toThrow(/invalid or expired/);
  });

  it('an invite for a roster person links that person to the new account', async () => {
    const rows = await db.as<{ id: string }>(
      team.organizer,
      `insert into public.people (team_id, display_name) values ($1, 'Jirka bez účtu') returning id`,
      [team.teamId],
    );
    const personId = rows[0]?.id ?? '';
    const sheet = await insertRecord(db, team, { kind: 'character', game_id: game });
    await attach(db, team, sheet, personId, 'player');
    const codeRows = await db.as<{ c: string }>(
      team.organizer,
      `select public.create_invite($1, 'player', $2) as c`,
      [team.teamId, personId],
    );
    const jirka = await createUser(db, 'jirka');
    await db.as(jirka, 'select public.join_team($1, $2)', [codeRows[0]?.c, 'Jiné jméno']);
    expect(await canSee(db, jirka, sheet)).toBe(true);
  });

  it('the last organizer cannot be demoted or removed', async () => {
    const solo = await createUser(db, 'solo');
    const rows = await db.as<{ t: string }>(
      solo,
      `select public.create_team('Sólo', 'Sólista') as t`,
    );
    const soloTeam = rows[0]?.t;
    await expect(
      db.as(solo, `select public.set_member_role($1, $2, 'player')`, [soloTeam, solo]),
    ).rejects.toThrow(/at least one organizer/);
    await expect(
      db.as(solo, 'select public.remove_member($1, $2)', [soloTeam, solo]),
    ).rejects.toThrow(/at least one organizer/);
  });
});

describe('view as player and who can see', () => {
  it('visible_record_ids returns exactly what RLS returns for each member', async () => {
    const members: [string, string][] = [
      [team.player1, team.person.player1],
      [team.player2, team.person.player2],
      [team.npc, team.person.npc],
      [team.organizer2, team.person.organizer2],
    ];
    for (const [user, person] of members) {
      const viaRls = (
        await db.as<{ id: string }>(user, 'select id from public.records where team_id = $1', [
          team.teamId,
        ])
      )
        .map((row) => row.id)
        .sort();
      const viaPreview = (
        await db.as<{ id: string }>(
          team.organizer,
          'select public.visible_record_ids($1, $2) as id',
          [team.teamId, person],
        )
      )
        .map((row) => row.id)
        .sort();
      expect(viaPreview).toEqual(viaRls);
    }
  });

  it('only organizers may preview or list readers', async () => {
    const page = await insertRecord(db, team, {
      kind: 'page',
      visibility: 'everyone',
      game_id: game,
    });
    await expect(
      db.as(team.player1, 'select public.visible_record_ids($1, $2)', [
        team.teamId,
        team.person.player2,
      ]),
    ).rejects.toThrow(/only organizers/);
    await expect(
      db.as(team.player1, 'select * from public.record_readers($1)', [page]),
    ).rejects.toThrow(/only organizers/);
  });

  it('record_readers lists exactly the people who can read the record', async () => {
    const sheet = await insertRecord(db, team, { kind: 'character', game_id: game });
    await attach(db, team, sheet, team.person.player2, 'player');
    const readers = await db.as<{ display_name: string }>(
      team.organizer,
      'select display_name from public.record_readers($1)',
      [sheet],
    );
    expect(readers.map((row) => row.display_name)).toEqual([
      'Bára Organizátorka',
      'Ivo Hráč',
      'Kvido Organizátor',
    ]);
  });
});
