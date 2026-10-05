import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attach, createTeam, insertRecord, type TeamFixture } from './fixtures';
import { openTestDb, type TestDb } from './harness';

let db: TestDb;
let team: TeamFixture;
let game: string;

const sha = (char: string) => char.repeat(64);

beforeAll(async () => {
  db = await openTestDb();
  team = await createTeam(db);
  const world = await insertRecord(db, team, { kind: 'world', visibility: 'everyone' });
  game = await insertRecord(db, team, { kind: 'game', world_id: world, visibility: 'everyone' });
}, 60_000);

afterAll(async () => {
  await db.close();
});

async function newFile(visibility: 'organizers' | 'everyone' = 'organizers') {
  return insertRecord(db, team, { kind: 'file', title: 'Dopis.docx', game_id: game, visibility });
}

/** Uploads an object as `user` (through the storage RLS policies). */
async function putObject(user: string, teamId: string, fileId: string, versionId = randomUUID()) {
  await db.as(
    user,
    `insert into storage.objects (bucket_id, name, owner) values ('files', $1, $2)`,
    [`${teamId}/${fileId}/${versionId}`, user],
  );
  return versionId;
}

async function commit(
  user: string,
  fileId: string,
  versionId: string,
  options: { session?: string | null; base?: string | null; hash?: string } = {},
) {
  const rows = await db.as<{
    r: { version_id: string; no: number; conflict: boolean; replaced_path: string | null };
  }>(user, `select public.commit_file_version($1, $2, 10, $3, 'text/plain', $4, $5) as r`, [
    fileId,
    versionId,
    options.hash ?? sha('a'),
    options.session ?? null,
    options.base ?? null,
  ]);
  const result = rows[0]?.r;
  if (!result) throw new Error('no result');
  return result;
}

async function objectVisible(user: string, path: string) {
  const rows = await db.as(
    user,
    `select 1 from storage.objects where bucket_id = 'files' and name = $1`,
    [path],
  );
  return rows.length === 1;
}

describe('file storage policies', () => {
  it('objects of an organizer-only file are readable by organizers only', async () => {
    const file = await newFile();
    const version = await putObject(team.organizer, team.teamId, file);
    const path = `${team.teamId}/${file}/${version}`;
    expect(await objectVisible(team.organizer2, path)).toBe(true);
    expect(await objectVisible(team.player1, path)).toBe(false);
    expect(await objectVisible(team.npc, path)).toBe(false);
    expect(await objectVisible(team.outsider, path)).toBe(false);
  });

  it('objects follow the file record: shared files can be downloaded', async () => {
    const file = await newFile('everyone');
    const version = await putObject(team.organizer, team.teamId, file);
    expect(await objectVisible(team.player1, `${team.teamId}/${file}/${version}`)).toBe(true);
  });

  it('a player’s own attached file is readable by that player only', async () => {
    const file = await newFile();
    await attach(db, team, file, team.person.player1, 'player');
    const version = await putObject(team.organizer, team.teamId, file);
    expect(await objectVisible(team.player1, `${team.teamId}/${file}/${version}`)).toBe(true);
    expect(await objectVisible(team.player2, `${team.teamId}/${file}/${version}`)).toBe(false);
  });

  it('only organizers upload, and only into an existing file of their team', async () => {
    const file = await newFile('everyone');
    await expect(putObject(team.player1, team.teamId, file)).rejects.toThrow(/row-level security/);
    const other = await createTeam(db);
    await expect(putObject(team.organizer, other.teamId, file)).rejects.toThrow(
      /row-level security/,
    );
    await expect(putObject(team.organizer, team.teamId, randomUUID())).rejects.toThrow(
      /row-level security/,
    );
    await expect(
      db.as(team.organizer, `insert into storage.objects (bucket_id, name) values ('files', $1)`, [
        `${team.teamId}/${file}/not-a-uuid`,
      ]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('check-out and check-in', () => {
  it('a second organizer cannot check out a locked file', async () => {
    const file = await newFile();
    await db.as(team.organizer, `select public.checkout_file($1, 'notebook-kvido')`, [file]);
    await expect(db.as(team.organizer2, 'select public.checkout_file($1)', [file])).rejects.toThrow(
      /locked by Kvido Organizátor/,
    );
    const locks = await db.as<{ display_name: string }>(
      team.player1,
      'select * from public.file_locks where file_id = $1',
      [file],
    );
    expect(locks).toHaveLength(0);
    const visible = await db.as<{ display_name: string }>(
      team.organizer2,
      'select display_name from public.file_locks where file_id = $1',
      [file],
    );
    expect(visible[0]?.display_name).toBe('Kvido Organizátor');
  });

  it('a stale lock can be taken over, and any organizer can force-release', async () => {
    const file = await newFile();
    await db.as(team.organizer, 'select public.checkout_file($1)', [file]);
    await db.admin(
      `update public.file_locks set heartbeat_at = now() - interval '11 minutes' where file_id = $1`,
      [file],
    );
    await db.as(team.organizer2, 'select public.checkout_file($1)', [file]);
    await db.as(team.organizer, 'select public.force_release_lock($1)', [file]);
    expect(
      await db.admin('select * from public.file_locks where file_id = $1', [file]),
    ).toHaveLength(0);
    await expect(
      db.as(team.player1, 'select public.force_release_lock($1)', [file]),
    ).rejects.toThrow(/only organizers/);
  });

  it('players cannot check out', async () => {
    const file = await newFile('everyone');
    await expect(db.as(team.player1, 'select public.checkout_file($1)', [file])).rejects.toThrow(
      /only organizers/,
    );
  });

  it('saves during one session replace one working version', async () => {
    const file = await newFile();
    const first = await putObject(team.organizer, team.teamId, file);
    const initial = await commit(team.organizer, file, first);
    expect(initial).toMatchObject({ no: 1, conflict: false });

    const sessionRows = await db.as<{ s: string }>(
      team.organizer,
      'select public.checkout_file($1) as s',
      [file],
    );
    const session = sessionRows[0]?.s ?? '';
    const save1 = await putObject(team.organizer, team.teamId, file);
    const r1 = await commit(team.organizer, file, save1, { session, hash: sha('b') });
    const save2 = await putObject(team.organizer, team.teamId, file);
    const r2 = await commit(team.organizer, file, save2, { session, hash: sha('c') });
    expect(r1).toMatchObject({ no: 2, conflict: false, replaced_path: null });
    expect(r2).toMatchObject({
      no: 2,
      conflict: false,
      replaced_path: `${team.teamId}/${file}/${save1}`,
    });

    const versions = await db.as<{ no: number; sha256: string }>(
      team.organizer,
      'select no, sha256 from public.file_versions where file_id = $1 order by no',
      [file],
    );
    expect(versions).toEqual([
      { no: 1, sha256: sha('a') },
      { no: 2, sha256: sha('c') },
    ]);

    // "Uložit jako verzi" freezes it; the next save starts version 3.
    await db.as(team.organizer, 'select public.keep_session_version($1, $2)', [file, session]);
    const save3 = await putObject(team.organizer, team.teamId, file);
    expect(await commit(team.organizer, file, save3, { session, hash: sha('d') })).toMatchObject({
      no: 3,
    });

    const record = await db.as<{ data: { current_version_no: number; sha256: string } }>(
      team.organizer,
      'select data from public.records where id = $1',
      [file],
    );
    expect(record[0]?.data).toMatchObject({ current_version_no: 3, sha256: sha('d') });
  });

  it('a save after losing the lock becomes a conflict version and leaves the current one', async () => {
    const file = await newFile();
    const v1 = await putObject(team.organizer, team.teamId, file);
    await commit(team.organizer, file, v1);
    const kvidoRows = await db.as<{ s: string }>(
      team.organizer,
      'select public.checkout_file($1) as s',
      [file],
    );
    const kvidoSession = kvidoRows[0]?.s ?? '';
    // Kvido goes offline; the lock goes stale and Bára takes over and saves.
    await db.admin(
      `update public.file_locks set heartbeat_at = now() - interval '11 minutes' where file_id = $1`,
      [file],
    );
    const baraRows = await db.as<{ s: string }>(
      team.organizer2,
      'select public.checkout_file($1) as s',
      [file],
    );
    const bara = await putObject(team.organizer2, team.teamId, file);
    await commit(team.organizer2, file, bara, { session: baraRows[0]?.s ?? '', hash: sha('e') });
    // Kvido comes back online and his save arrives.
    const late = await putObject(team.organizer, team.teamId, file);
    const result = await commit(team.organizer, file, late, {
      session: kvidoSession,
      hash: sha('f'),
    });
    expect(result.conflict).toBe(true);
    expect(
      await db.as(team.organizer, 'select public.heartbeat_lock($1, $2) as ok', [
        file,
        kvidoSession,
      ]),
    ).toEqual([{ ok: false }]);
    const record = await db.as<{ data: { sha256: string } }>(
      team.organizer,
      'select data from public.records where id = $1',
      [file],
    );
    expect(record[0]?.data.sha256).toBe(sha('e'));
  });

  it('a plain upload is refused while someone else holds the lock', async () => {
    const file = await newFile();
    await db.as(team.organizer, 'select public.checkout_file($1)', [file]);
    const version = await putObject(team.organizer2, team.teamId, file);
    await expect(commit(team.organizer2, file, version)).rejects.toThrow(/locked by/);
  });

  it('the current version cannot be deleted; older ones can', async () => {
    const file = await newFile();
    const v1 = await putObject(team.organizer, team.teamId, file);
    const r1 = await commit(team.organizer, file, v1);
    const v2 = await putObject(team.organizer, team.teamId, file);
    const r2 = await commit(team.organizer, file, v2, { hash: sha('b') });
    await expect(
      db.as(team.organizer, 'delete from public.file_versions where id = $1', [r2.version_id]),
    ).rejects.toThrow(/current version/);
    const deleted = await db.as(
      team.organizer,
      'delete from public.file_versions where id = $1 returning id',
      [r1.version_id],
    );
    expect(deleted).toHaveLength(1);
  });

  it('players read versions and text only of files they can see', async () => {
    const hidden = await newFile();
    const shared = await newFile('everyone');
    for (const file of [hidden, shared]) {
      const version = await putObject(team.organizer, team.teamId, file);
      await commit(team.organizer, file, version);
      await db.as(
        team.organizer,
        `insert into public.file_text (file_id, team_id, text) values ($1, $2, 'tajný text')`,
        [file, team.teamId],
      );
    }
    const versions = await db.as<{ file_id: string }>(
      team.player1,
      'select file_id from public.file_versions where file_id = any($1)',
      [[hidden, shared]],
    );
    expect(versions.map((row) => row.file_id)).toEqual([shared]);
    const texts = await db.as<{ file_id: string }>(
      team.player1,
      'select file_id from public.file_text where file_id = any($1)',
      [[hidden, shared]],
    );
    expect(texts.map((row) => row.file_id)).toEqual([shared]);
    await expect(
      db.as(team.player1, `update public.file_text set text = 'x' where file_id = $1`, [shared]),
    ).resolves.toEqual([]);
  });

  it('storage usage is for organizers', async () => {
    const rows = await db.as<{ bytes: string }>(
      team.organizer,
      'select public.storage_usage($1) as bytes',
      [team.teamId],
    );
    expect(Number(rows[0]?.bytes)).toBeGreaterThan(0);
    await expect(
      db.as(team.player1, 'select public.storage_usage($1)', [team.teamId]),
    ).rejects.toThrow(/only organizers/);
  });
});
