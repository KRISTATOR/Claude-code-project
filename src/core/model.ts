import { z } from 'zod';

/**
 * Row shapes of the synced tables, as returned by Supabase. Parsed with zod at
 * the boundary (CLAUDE.md, code conventions); unknown extra columns are kept
 * out of the cache.
 */

export const memberRoles = ['organizer', 'npc', 'player'] as const;
export type MemberRole = (typeof memberRoles)[number];

export const visibilities = ['organizers', 'specific', 'everyone'] as const;
export type Visibility = (typeof visibilities)[number];

const uuid = z.uuid();
const timestamp = z.string();
const jsonObject = z.record(z.string(), z.unknown());

export const teamRow = z.object({
  id: uuid,
  name: z.string(),
  settings: jsonObject,
  min_app_version: z.string(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type TeamRow = z.infer<typeof teamRow>;

export const personRow = z.object({
  id: uuid,
  team_id: uuid,
  display_name: z.string(),
  user_id: uuid.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: timestamp.nullable(),
});
export type PersonRow = z.infer<typeof personRow>;

export const memberRow = z.object({
  team_id: uuid,
  user_id: uuid,
  person_id: uuid,
  role: z.enum(memberRoles),
  joined_at: timestamp,
  updated_at: timestamp,
});
export type MemberRow = z.infer<typeof memberRow>;

export const inviteRow = z.object({
  id: uuid,
  team_id: uuid,
  code: z.string(),
  role: z.enum(memberRoles),
  person_id: uuid.nullable(),
  created_by: uuid.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  expires_at: timestamp,
  max_uses: z.number().int(),
  use_count: z.number().int(),
  revoked_at: timestamp.nullable(),
});
export type InviteRow = z.infer<typeof inviteRow>;

export const recordRow = z.object({
  id: uuid,
  team_id: uuid,
  kind: z.string(),
  world_id: uuid.nullable(),
  game_id: uuid.nullable(),
  parent_id: uuid.nullable(),
  title: z.string(),
  data: jsonObject,
  visibility: z.enum(visibilities),
  inherit_audience: z.boolean(),
  sort_key: z.string(),
  tags: z.array(z.string()),
  rev: z.number().int(),
  created_by: uuid.nullable(),
  created_at: timestamp,
  updated_by: uuid.nullable(),
  updated_at: timestamp,
  deleted_by: uuid.nullable(),
  deleted_at: timestamp.nullable(),
});
export type RecordRow = z.infer<typeof recordRow>;

export const recordSecretRow = z.object({
  record_id: uuid,
  team_id: uuid,
  data: jsonObject,
  rev: z.number().int(),
  updated_by: uuid.nullable(),
  updated_at: timestamp,
});
export type RecordSecretRow = z.infer<typeof recordSecretRow>;

export const recordAccessRow = z.object({
  id: uuid,
  record_id: uuid,
  team_id: uuid,
  person_id: uuid.nullable(),
  member_role: z.enum(memberRoles).nullable(),
  updated_at: timestamp,
});
export type RecordAccessRow = z.infer<typeof recordAccessRow>;

export const recordPersonRow = z.object({
  record_id: uuid,
  team_id: uuid,
  person_id: uuid,
  relation: z.enum(['player', 'actor']),
  updated_at: timestamp,
});
export type RecordPersonRow = z.infer<typeof recordPersonRow>;

export const recordLinkRow = z.object({
  team_id: uuid,
  from_id: uuid,
  to_id: uuid,
  kind: z.string(),
  updated_at: timestamp,
});
export type RecordLinkRow = z.infer<typeof recordLinkRow>;

/** What a person may do, derived from their membership. */
export function canEditTeam(role: MemberRole | null | undefined): boolean {
  return role === 'organizer';
}

export const fileLockRow = z.object({
  file_id: uuid,
  team_id: uuid,
  user_id: uuid,
  display_name: z.string(),
  machine: z.string(),
  session_id: uuid,
  acquired_at: timestamp,
  heartbeat_at: timestamp,
  updated_at: timestamp,
});
export type FileLockRow = z.infer<typeof fileLockRow>;

export const fileTextRow = z.object({
  file_id: uuid,
  team_id: uuid,
  version_id: uuid.nullable(),
  text: z.string(),
  updated_at: timestamp,
});
export type FileTextRow = z.infer<typeof fileTextRow>;

export const fileVersionRow = z.object({
  id: uuid,
  team_id: uuid,
  file_id: uuid,
  no: z.number().int(),
  storage_path: z.string(),
  size: z.coerce.number(),
  sha256: z.string(),
  mime: z.string(),
  session_id: uuid.nullable(),
  kept: z.boolean(),
  base_version_id: uuid.nullable(),
  is_conflict: z.boolean(),
  pinned: z.boolean(),
  label: z.string(),
  created_by: uuid.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type FileVersionRow = z.infer<typeof fileVersionRow>;

/** A lock nobody refreshed for this long is stale (matches private.lock_ttl()). */
export const LOCK_TTL_MS = 10 * 60 * 1000;

export function isLockFresh(lock: Pick<FileLockRow, 'heartbeat_at'>, now: number): boolean {
  return now - new Date(lock.heartbeat_at).getTime() < LOCK_TTL_MS;
}

export const registrationStatuses = [
  'applied',
  'confirmed',
  'paid',
  'assigned',
  'cancelled',
] as const;
export type RegistrationStatus = (typeof registrationStatuses)[number];

/**
 * A participant's registration (M6). Personal data: it lives in its own
 * table, never in records, search or default exports (docs/PLAN.md §3.1).
 */
export const registrationRow = z.object({
  id: uuid,
  team_id: uuid,
  game_id: uuid,
  person_id: uuid.nullable(),
  character_id: uuid.nullable(),
  name: z.string(),
  status: z.enum(registrationStatuses),
  is_minor: z.boolean(),
  consent_on_file: z.boolean(),
  allergens: z.array(z.string()),
  allergies: z.string(),
  emergency_contact: z.string(),
  note: z.string(),
  rev: z.number().int(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type RegistrationRow = z.infer<typeof registrationRow>;

export const eventKinds = ['note', 'phase', 'block', 'delivered', 'incident'] as const;
export type EventKind = (typeof eventKinds)[number];

/** One line of the backstage event log (M7). Append-only; ids come from the client. */
export const eventRow = z.object({
  id: uuid,
  team_id: uuid,
  game_id: uuid,
  kind: z.enum(eventKinds),
  text: z.string(),
  record_id: uuid.nullable(),
  at: timestamp,
  author_id: uuid.nullable(),
  author_person: uuid.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type EventRow = z.infer<typeof eventRow>;

/** A tracked value (wounds, drunkenness…) of a character or NPC at a moment (M7). */
export const readingRow = z.object({
  id: uuid,
  team_id: uuid,
  game_id: uuid,
  definition_id: uuid,
  subject_id: uuid,
  // Postgres numeric arrives as a string from PostgREST in some setups.
  value: z.coerce.number().nullable(),
  text: z.string(),
  at: timestamp,
  author_id: uuid.nullable(),
  author_person: uuid.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type ReadingRow = z.infer<typeof readingRow>;
