import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTeam, insertRecord, type TeamFixture } from './fixtures';
import { openTestDb, type TestDb } from './harness';

/** The live game's logs: crew (organizers and NPC actors) only, written through functions. */
let db: TestDb;
let team: TeamFixture;
let other: TeamFixture;
let game: string;
let character: string;
let tracker: string;
let secretDoc: string;
let sharedDoc: string;

const appendEvent = (user: string, id: string, text: string, record: string | null = null) =>
  db.as(user, 'select public.append_event($1, $2, $3, $4, $5, now())', [
    id,
    game,
    'note',
    text,
    record,
  ]);

const visible = async (user: string, table: string) =>
  (await db.as<{ id: string }>(user, `select id from public.${table}`)).map((row) => row.id);

beforeAll(async () => {
  db = await openTestDb();
  team = await createTeam(db);
  other = await createTeam(db);
  const world = await insertRecord(db, team, { kind: 'world', visibility: 'everyone' });
  game = await insertRecord(db, team, { kind: 'game', world_id: world, visibility: 'everyone' });
  character = await insertRecord(db, team, {
    kind: 'character',
    game_id: game,
    visibility: 'everyone',
  });
  tracker = await insertRecord(db, team, {
    kind: 'tracker_definition',
    game_id: game,
    visibility: 'everyone',
  });
  secretDoc = await insertRecord(db, team, {
    kind: 'prop_document',
    game_id: game,
    data: { status: 'printed' },
  });
  sharedDoc = await insertRecord(db, team, {
    kind: 'prop_document',
    game_id: game,
    visibility: 'everyone',
    data: { status: 'printed' },
  });
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('event log', () => {
  const byOrganizer = randomUUID();
  const byNpc = randomUUID();

  it('organizers and NPC actors append; a replay changes nothing', async () => {
    await appendEvent(team.organizer, byOrganizer, 'Začala bouřka');
    await appendEvent(team.organizer, byOrganizer, 'Jiný text');
    await appendEvent(team.npc, byNpc, 'Lapka chycen');
    const rows = await db.admin<{ id: string; text: string; author_person: string }>(
      'select id, text, author_person from public.event_log where id = any($1) order by text',
      [[byOrganizer, byNpc]],
    );
    expect(rows).toEqual([
      { id: byNpc, text: 'Lapka chycen', author_person: team.person.npc },
      { id: byOrganizer, text: 'Začala bouřka', author_person: team.person.organizer },
    ]);
  });

  it('players, outsiders and other teams cannot append', async () => {
    for (const user of [team.player1, team.outsider, other.organizer]) {
      await expect(appendEvent(user, randomUUID(), 'x')).rejects.toThrow(/not allowed/);
    }
  });

  it('crew can link only records they may read', async () => {
    await expect(appendEvent(team.npc, randomUUID(), 'x', secretDoc)).rejects.toThrow(
      /not allowed/,
    );
    await appendEvent(team.npc, randomUUID(), 'Dopis předán', sharedDoc);
  });

  it('only the crew reads the log', async () => {
    expect(await visible(team.organizer2, 'event_log')).toContain(byNpc);
    expect(await visible(team.npc, 'event_log')).toContain(byOrganizer);
    expect(await visible(team.player1, 'event_log')).toEqual([]);
    expect(await visible(team.outsider, 'event_log')).toEqual([]);
    expect(await visible(other.organizer, 'event_log')).toEqual([]);
  });

  it('nobody inserts or updates directly; only organizers delete', async () => {
    await expect(
      db.as(
        team.organizer,
        `insert into public.event_log (id, team_id, game_id, kind, at) values ($1, $2, $3, 'note', now())`,
        [randomUUID(), team.teamId, game],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as(team.organizer, `update public.event_log set text = 'x' where id = $1`, [byNpc]),
    ).rejects.toThrow(/permission denied/);
    expect(
      await db.as(team.npc, 'delete from public.event_log where id = $1 returning id', [
        byOrganizer,
      ]),
    ).toHaveLength(0);
    expect(
      await db.as(team.organizer, 'delete from public.event_log where id = $1 returning id', [
        byNpc,
      ]),
    ).toHaveLength(1);
  });
});

describe('tracker readings', () => {
  const record = (user: string, id: string, subject = character, definition = tracker) =>
    db.as(user, 'select public.record_reading($1, $2, $3, $4, $5, now())', [
      id,
      definition,
      subject,
      2,
      'šíp v rameni',
    ]);

  it('crew record values, idempotently; only crew reads them', async () => {
    const id = randomUUID();
    await record(team.npc, id);
    await record(team.npc, id);
    expect(await visible(team.organizer, 'tracker_readings')).toEqual([id]);
    expect(await visible(team.npc, 'tracker_readings')).toEqual([id]);
    expect(await visible(team.player1, 'tracker_readings')).toEqual([]);
    expect(await visible(team.outsider, 'tracker_readings')).toEqual([]);
  });

  it('refuses players, outsiders and readings about the wrong records', async () => {
    for (const user of [team.player1, team.outsider]) {
      await expect(record(user, randomUUID())).rejects.toThrow(/not allowed/);
    }
    await expect(record(team.organizer, randomUUID(), sharedDoc)).rejects.toThrow(
      /character or NPC/,
    );
    await expect(record(team.organizer, randomUUID(), character, sharedDoc)).rejects.toThrow(
      /character or NPC/,
    );
  });
});

describe('mark_delivered', () => {
  const status = async (id: string) =>
    (
      await db.admin<{ status: string; rev: number }>(
        `select data->>'status' as status, rev from public.records where id = $1`,
        [id],
      )
    )[0];

  it('marks a document delivered and logs it once', async () => {
    const event = randomUUID();
    await db.as(team.organizer, 'select public.mark_delivered($1, $2, now())', [event, secretDoc]);
    const after = await status(secretDoc);
    expect(after?.status).toBe('delivered');
    await db.as(team.organizer, 'select public.mark_delivered($1, $2, now())', [event, secretDoc]);
    expect((await status(secretDoc))?.rev).toBe(after?.rev);
    const logged = await db.admin<{ kind: string; record_id: string }>(
      'select kind, record_id from public.event_log where id = $1',
      [event],
    );
    expect(logged).toEqual([{ kind: 'delivered', record_id: secretDoc }]);
  });

  it('NPC actors deliver what they can see; players never', async () => {
    await expect(
      db.as(team.npc, 'select public.mark_delivered($1, $2, now())', [randomUUID(), secretDoc]),
    ).rejects.toThrow(/not allowed/);
    await expect(
      db.as(team.player1, 'select public.mark_delivered($1, $2, now())', [randomUUID(), sharedDoc]),
    ).rejects.toThrow(/not allowed/);
    await db.as(team.npc, 'select public.mark_delivered($1, $2, now())', [randomUUID(), sharedDoc]);
    expect((await status(sharedDoc))?.status).toBe('delivered');
  });

  it('refuses records that cannot be delivered', async () => {
    await expect(
      db.as(team.organizer, 'select public.mark_delivered($1, $2, now())', [
        randomUUID(),
        character,
      ]),
    ).rejects.toThrow(/can be delivered/);
  });
});
