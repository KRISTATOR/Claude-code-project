import { z } from 'zod';
import {
  inviteRow,
  memberRoles,
  personRow,
  recordAccessRow,
  recordPersonRow,
  recordRow,
  recordSecretRow,
  type MemberRole,
  type RecordRow,
  type Visibility,
} from '@core/model';
import type { Cache } from './cache';
import { classifyError, RemoteError } from './remote';
import { errorFields, type Client } from './supabase';

export interface NewRecord {
  kind: string;
  title: string;
  data?: Record<string, unknown>;
  world_id?: string | null;
  game_id?: string | null;
  parent_id?: string | null;
  visibility?: Visibility;
  inherit_audience?: boolean;
  sort_key?: string;
  tags?: string[];
}

export type RecordPatch = Partial<
  Pick<
    RecordRow,
    'title' | 'data' | 'parent_id' | 'sort_key' | 'tags' | 'deleted_at' | 'inherit_audience'
  >
>;

interface Response {
  data: unknown;
  error: { message: string; code?: string } | null;
  status: number;
}

/** Awaits a Supabase call; returns its data as `unknown` (parse it with zod). */
export async function call(promise: PromiseLike<Response>): Promise<unknown> {
  let response: Response;
  try {
    response = await promise;
  } catch (thrown) {
    throw classifyError(thrown);
  }
  if (response.error) throw classifyError(errorFields(response.error, response.status));
  return response.data;
}

const readerRow = z.object({
  person_id: z.string(),
  display_name: z.string(),
  role: z.enum(memberRoles),
  has_account: z.boolean(),
});
export type Reader = z.infer<typeof readerRow>;

/**
 * All writes. Each goes to Supabase first; only the row the server confirms
 * is written into the local cache (docs/PLAN.md §2.3).
 */
export class Repo {
  constructor(
    private readonly client: Client,
    private readonly cache: Cache,
    private readonly teamId: string,
  ) {}

  async createRecord(input: NewRecord): Promise<RecordRow> {
    const data = await call(
      this.client
        .from('records')
        .insert({
          team_id: this.teamId,
          kind: input.kind,
          title: input.title,
          data: input.data ?? {},
          world_id: input.world_id ?? null,
          game_id: input.game_id ?? null,
          parent_id: input.parent_id ?? null,
          visibility: input.visibility ?? 'organizers',
          inherit_audience: input.inherit_audience ?? false,
          sort_key: input.sort_key ?? '',
          tags: input.tags ?? [],
        })
        .select()
        .single(),
    );
    const row = recordRow.parse(data);
    await this.cache.records.put(row);
    return row;
  }

  /**
   * Updates a record only if nobody changed it since `expectedRev`. On a
   * conflict, the newer server row is put into the cache and a RemoteError
   * with kind "conflict" is thrown.
   */
  async updateRecord(id: string, expectedRev: number, patch: RecordPatch): Promise<RecordRow> {
    const rows = z
      .array(recordRow)
      .parse(
        await call(
          this.client.from('records').update(patch).eq('id', id).eq('rev', expectedRev).select(),
        ),
      );
    const row = rows[0];
    if (!row) {
      await this.refreshRecord(id);
      throw new RemoteError('conflict', 'record changed meanwhile');
    }
    await this.cache.records.put(row);
    return row;
  }

  /** Re-reads one record from the server into the cache (or removes it). */
  async refreshRecord(id: string): Promise<RecordRow | undefined> {
    const fresh = z
      .array(recordRow)
      .parse(await call(this.client.from('records').select().eq('id', id)))[0];
    if (fresh) await this.cache.records.put(fresh);
    else await this.cache.records.delete(id);
    return fresh;
  }

  trashRecord(record: RecordRow): Promise<RecordRow> {
    return this.updateRecord(record.id, record.rev, { deleted_at: new Date().toISOString() });
  }

  restoreRecord(record: RecordRow): Promise<RecordRow> {
    return this.updateRecord(record.id, record.rev, { deleted_at: null });
  }

  async setVisibility(
    record: RecordRow,
    visibility: Visibility,
    people: string[],
    roles: MemberRole[],
  ): Promise<void> {
    await call(
      this.client.rpc('set_record_visibility', {
        p_record: record.id,
        p_visibility: visibility,
        p_people: people,
        p_roles: roles,
      }),
    );
    await this.refreshRecord(record.id);
    const access = z
      .array(recordAccessRow)
      .parse(await call(this.client.from('record_access').select().eq('record_id', record.id)));
    await this.cache.transaction('rw', this.cache.access, async () => {
      await this.cache.access.where('record_id').equals(record.id).delete();
      await this.cache.access.bulkPut(access);
    });
  }

  /** Replaces a record's organizer-only part. */
  async saveSecret(recordId: string, data: Record<string, unknown>): Promise<void> {
    const row = recordSecretRow.parse(
      await call(
        this.client
          .from('record_secrets')
          .upsert({ record_id: recordId, team_id: this.teamId, data })
          .select()
          .single(),
      ),
    );
    await this.cache.secrets.put(row);
  }

  /** Attaches a person as player or actor (rule R4). */
  async attach(recordId: string, personId: string, relation: 'player' | 'actor'): Promise<void> {
    const row = recordPersonRow.parse(
      await call(
        this.client
          .from('record_people')
          .upsert({ record_id: recordId, team_id: this.teamId, person_id: personId, relation })
          .select()
          .single(),
      ),
    );
    await this.cache.recordPeople.put(row);
  }

  async detach(recordId: string, personId: string, relation: 'player' | 'actor'): Promise<void> {
    await call(
      this.client
        .from('record_people')
        .delete()
        .eq('record_id', recordId)
        .eq('person_id', personId)
        .eq('relation', relation),
    );
    await this.cache.recordPeople.delete([recordId, personId, relation]);
  }

  /** Makes exactly `personIds` attached with `relation`. */
  async setAttached(
    recordId: string,
    relation: 'player' | 'actor',
    personIds: string[],
  ): Promise<void> {
    const current = await this.cache.recordPeople.where('record_id').equals(recordId).toArray();
    const existing = current.filter((row) => row.relation === relation).map((row) => row.person_id);
    for (const id of existing.filter((id) => !personIds.includes(id)))
      await this.detach(recordId, id, relation);
    for (const id of personIds.filter((id) => !existing.includes(id)))
      await this.attach(recordId, id, relation);
  }

  /** Hard delete (organizers): used for small records like relationships. */
  async deleteRecord(recordId: string): Promise<void> {
    await call(this.client.from('records').delete().eq('id', recordId));
    await this.cache.records.delete(recordId);
  }

  async readers(recordId: string): Promise<Reader[]> {
    return z
      .array(readerRow)
      .parse(await call(this.client.rpc('record_readers', { p_record: recordId })));
  }

  async visibleRecordIds(personId: string): Promise<string[]> {
    return z
      .array(z.string())
      .parse(
        await call(
          this.client.rpc('visible_record_ids', { p_team: this.teamId, p_person: personId }),
        ),
      );
  }

  async renameTeam(name: string): Promise<void> {
    await call(this.client.from('teams').update({ name }).eq('id', this.teamId));
  }

  async addPerson(displayName: string): Promise<void> {
    const data = await call(
      this.client
        .from('people')
        .insert({ team_id: this.teamId, display_name: displayName })
        .select()
        .single(),
    );
    await this.cache.people.put(personRow.parse(data));
  }

  async renamePerson(personId: string, displayName: string): Promise<void> {
    const data = await call(
      this.client
        .from('people')
        .update({ display_name: displayName })
        .eq('id', personId)
        .select()
        .single(),
    );
    await this.cache.people.put(personRow.parse(data));
  }

  async createInvite(input: {
    role: MemberRole;
    personId: string | null;
    days: number;
    maxUses: number;
  }): Promise<string> {
    const code = z.string().parse(
      await call(
        this.client.rpc('create_invite', {
          p_team: this.teamId,
          p_role: input.role,
          p_person: input.personId,
          p_days: input.days,
          p_max_uses: input.maxUses,
        }),
      ),
    );
    const invites = z
      .array(inviteRow)
      .parse(await call(this.client.from('invites').select().eq('team_id', this.teamId)));
    await this.cache.invites.bulkPut(invites);
    return code;
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const data = await call(
      this.client
        .from('invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', inviteId)
        .select()
        .single(),
    );
    await this.cache.invites.put(inviteRow.parse(data));
  }

  async setMemberRole(userId: string, role: MemberRole): Promise<void> {
    await call(
      this.client.rpc('set_member_role', { p_team: this.teamId, p_user: userId, p_role: role }),
    );
  }

  async removeMember(userId: string): Promise<void> {
    await call(this.client.rpc('remove_member', { p_team: this.teamId, p_user: userId }));
  }

  async setTemporaryPassword(userId: string, password: string): Promise<void> {
    const result: { error: unknown } = await this.client.functions.invoke('admin-set-password', {
      body: { team_id: this.teamId, user_id: userId, password },
    });
    const error = result.error;
    if (error)
      throw classifyError({
        message: error instanceof Error ? error.message : 'edge function failed',
      });
  }
}

/** Team-independent server calls used before a team is chosen. */
export async function createTeam(
  client: Client,
  name: string,
  displayName: string,
): Promise<string> {
  return z
    .string()
    .parse(await call(client.rpc('create_team', { p_name: name, p_display_name: displayName })));
}

export async function joinTeam(client: Client, code: string, displayName: string): Promise<string> {
  return z
    .string()
    .parse(await call(client.rpc('join_team', { p_code: code, p_display_name: displayName })));
}
