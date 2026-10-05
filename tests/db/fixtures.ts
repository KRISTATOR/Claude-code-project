import { createUser, type TestDb } from './harness';

export interface TeamFixture {
  teamId: string;
  organizer: string;
  organizer2: string;
  npc: string;
  player1: string;
  player2: string;
  outsider: string;
  person: Record<'organizer' | 'organizer2' | 'npc' | 'player1' | 'player2', string>;
}

async function rpc<T>(db: TestDb, user: string, sql: string, params: unknown[]): Promise<T> {
  const rows = await db.as<{ result: T }>(user, `select ${sql} as result`, params);
  const row = rows[0];
  if (!row) throw new Error(`no result from ${sql}`);
  return row.result;
}

/** A team with two organizers, one NPC actor, two players, plus an outsider. */
export async function createTeam(db: TestDb): Promise<TeamFixture> {
  const organizer = await createUser(db, 'org');
  const organizer2 = await createUser(db, 'org2');
  const npc = await createUser(db, 'npc');
  const player1 = await createUser(db, 'hrac1');
  const player2 = await createUser(db, 'hrac2');
  const outsider = await createUser(db, 'cizi');

  const teamId = await rpc<string>(db, organizer, 'public.create_team($1, $2)', [
    'Spolek Jedlová',
    'Kvido Organizátor',
  ]);
  const join = async (user: string, role: string, name: string) => {
    const code = await rpc<string>(
      db,
      organizer,
      'public.create_invite($1, $2::public.member_role)',
      [teamId, role],
    );
    await rpc(db, user, 'public.join_team($1, $2)', [code, name]);
  };
  await join(organizer2, 'organizer', 'Bára Organizátorka');
  await join(npc, 'npc', 'Ota Cépák');
  await join(player1, 'player', 'Hana Hráčka');
  await join(player2, 'player', 'Ivo Hráč');

  const people = await db.admin<{ user_id: string; person_id: string }>(
    'select user_id, person_id from public.team_members where team_id = $1',
    [teamId],
  );
  const personOf = (user: string) => {
    const found = people.find((row) => row.user_id === user);
    if (!found) throw new Error('missing person');
    return found.person_id;
  };
  return {
    teamId,
    organizer,
    organizer2,
    npc,
    player1,
    player2,
    outsider,
    person: {
      organizer: personOf(organizer),
      organizer2: personOf(organizer2),
      npc: personOf(npc),
      player1: personOf(player1),
      player2: personOf(player2),
    },
  };
}

export interface RecordInput {
  kind: string;
  title?: string;
  visibility?: 'organizers' | 'specific' | 'everyone';
  world_id?: string | null;
  game_id?: string | null;
  parent_id?: string | null;
  inherit_audience?: boolean;
  data?: Record<string, unknown>;
}

/** Inserts a record as the organizer (through RLS) and returns its id. */
export async function insertRecord(
  db: TestDb,
  team: TeamFixture,
  input: RecordInput,
): Promise<string> {
  const rows = await db.as<{ id: string }>(
    team.organizer,
    `insert into public.records (team_id, kind, title, visibility, world_id, game_id, parent_id, inherit_audience, data)
     values ($1, $2, $3, $4::public.visibility, $5, $6, $7, $8, $9::jsonb) returning id`,
    [
      team.teamId,
      input.kind,
      input.title ?? input.kind,
      input.visibility ?? 'organizers',
      input.world_id ?? null,
      input.game_id ?? null,
      input.parent_id ?? null,
      input.inherit_audience ?? false,
      JSON.stringify(input.data ?? {}),
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('insert failed');
  return id;
}

export async function attach(
  db: TestDb,
  team: TeamFixture,
  recordId: string,
  personId: string,
  relation: 'player' | 'actor',
): Promise<void> {
  await db.as(
    team.organizer,
    'insert into public.record_people (record_id, team_id, person_id, relation) values ($1, $2, $3, $4)',
    [recordId, team.teamId, personId, relation],
  );
}

export async function visibleIds(
  db: TestDb,
  user: string | null,
  table = 'records',
): Promise<string[]> {
  const column = table === 'record_secrets' ? 'record_id' : 'id';
  const rows = await db.as<{ id: string }>(user, `select ${column} as id from public.${table}`);
  return rows.map((row) => row.id).sort();
}

/**
 * Whether `user` can read the record through RLS. The anonymous role has no
 * table grants at all, so for `null` a "permission denied" also means "no".
 */
export async function canSee(db: TestDb, user: string | null, recordId: string): Promise<boolean> {
  try {
    const rows = await db.as(user, 'select 1 from public.records where id = $1', [recordId]);
    return rows.length === 1;
  } catch (error) {
    if (user === null && /permission denied/.test(String(error))) return false;
    throw error;
  }
}
