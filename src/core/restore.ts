import { z } from 'zod';
import { BACKUP_FORMAT } from './backup';
import type { memberRoles } from './model';
import {
  recordAccessRow,
  recordPersonRow,
  recordRow,
  recordSecretRow,
  registrationRow,
  type RecordRow,
} from './model';

/**
 * Restoring a "Záloha" (docs/PLAN.md §2.12). Into the same team, it puts
 * back what is missing on the server and leaves everything else alone. Into
 * another team (the old project is gone), every record gets a new id and
 * the people become roster entries without accounts; they rejoin with
 * invites. Records come back in an order that respects worlds, games and
 * folders, and files get their bytes from the backup.
 */
const backupPerson = z.object({ id: z.string(), display_name: z.string() });

export const backupFile = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number(),
  team: z.object({ id: z.string(), name: z.string() }),
  tables: z.object({
    people: z.array(backupPerson).catch([]).default([]),
    records: z.array(recordRow),
    record_secrets: z.array(recordSecretRow).catch([]).default([]),
    record_access: z.array(recordAccessRow).catch([]).default([]),
    record_people: z.array(recordPersonRow).catch([]).default([]),
    registrations: z.array(registrationRow).optional(),
  }),
});
export type BackupFile = z.infer<typeof backupFile>;

export interface RestoreRecord {
  id: string;
  kind: string;
  title: string;
  data: Record<string, unknown>;
  world_id: string | null;
  game_id: string | null;
  parent_id: string | null;
  visibility: RecordRow['visibility'];
  inherit_audience: boolean;
  sort_key: string;
  tags: string[];
  deleted_at: string | null;
}

export interface RestorePlan {
  sameTeam: boolean;
  /** People to add to the roster (no accounts). */
  people: { id: string; display_name: string }[];
  /** In insertion order: containers and parents first. */
  records: RestoreRecord[];
  secrets: { record_id: string; data: Record<string, unknown> }[];
  access: {
    record_id: string;
    person_id: string | null;
    member_role: (typeof memberRoles)[number] | null;
  }[];
  recordPeople: { record_id: string; person_id: string; relation: 'player' | 'actor' }[];
  registrations: Record<string, unknown>[];
  /** File records and where their bytes are in the backup archive. */
  files: { recordId: string; entry: string }[];
  /** Records the server already has (left untouched). */
  existing: number;
  /** File records the backup has no bytes for (not restored). */
  missingFiles: number;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Replaces every known id inside a JSON value (links in rich text, references in data). */
function remapJson<T>(value: T, ids: Map<string, string>): T {
  if (ids.size === 0) return value;
  return JSON.parse(
    JSON.stringify(value).replace(UUID, (id) => ids.get(id.toLowerCase()) ?? id),
  ) as T;
}

/** Parents before children: worlds, then games, then the rest by parent depth. */
function insertionOrder(records: RecordRow[]): RecordRow[] {
  const byId = new Map(records.map((row) => [row.id, row]));
  const depth = new Map<string, number>();
  const depthOf = (row: RecordRow, seen: Set<string>): number => {
    const known = depth.get(row.id);
    if (known !== undefined) return known;
    if (seen.has(row.id)) return 0;
    seen.add(row.id);
    let result = 0;
    for (const ref of [row.world_id, row.game_id, row.parent_id]) {
      const parent = ref ? byId.get(ref) : undefined;
      if (parent) result = Math.max(result, depthOf(parent, seen) + 1);
    }
    depth.set(row.id, result);
    return result;
  };
  return [...records].sort((a, b) => depthOf(a, new Set()) - depthOf(b, new Set()));
}

export function planRestore(
  backup: BackupFile,
  current: {
    teamId: string;
    /** Every record id the team has on the server, trash included. */
    recordIds: ReadonlySet<string>;
    people: readonly { id: string; display_name: string }[];
    registrationIds: ReadonlySet<string>;
    newId: () => string;
  },
): RestorePlan {
  const { tables } = backup;
  const sameTeam = backup.team.id === current.teamId;
  const ids = new Map<string, string>();
  const people: RestorePlan['people'] = [];

  // People: the same id in the same team; matched by name or added otherwise.
  const personIds = new Map<string, string>();
  for (const person of tables.people) {
    const existing = sameTeam
      ? current.people.find((row) => row.id === person.id)
      : current.people.find((row) => row.display_name.trim() === person.display_name.trim());
    if (existing) {
      personIds.set(person.id, existing.id);
    } else {
      const id = sameTeam ? person.id : current.newId();
      people.push({ id, display_name: person.display_name });
      personIds.set(person.id, id);
    }
  }
  if (!sameTeam) for (const [from, to] of personIds) ids.set(from.toLowerCase(), to);

  const missing = tables.records.filter((row) => !sameTeam || !current.recordIds.has(row.id));
  const missingFileIds = missing.filter((row) => row.kind === 'file').map((row) => row.id);
  const fileVersion = (row: RecordRow) =>
    typeof row.data['current_version_id'] === 'string' && row.data['current_version_id'] !== '';
  const restorable = missing.filter((row) => row.kind !== 'file' || fileVersion(row));
  if (!sameTeam) for (const row of restorable) ids.set(row.id.toLowerCase(), current.newId());
  const id = (value: string) => ids.get(value.toLowerCase()) ?? value;
  const ref = (value: string | null) => (value === null ? null : id(value));
  const restored = new Set(restorable.map((row) => row.id));

  const records = insertionOrder(restorable).map((row): RestoreRecord => {
    const data = remapJson({ ...row.data }, ids);
    if (row.kind === 'file') {
      // The file gets a fresh first version from the backup's bytes.
      delete data['current_version_id'];
      delete data['current_version_no'];
    }
    return {
      id: id(row.id),
      kind: row.kind,
      title: row.title,
      data,
      world_id: ref(row.world_id),
      game_id: ref(row.game_id),
      parent_id: ref(row.parent_id),
      visibility: row.visibility,
      inherit_audience: row.inherit_audience,
      sort_key: row.sort_key,
      tags: row.tags,
      deleted_at: row.deleted_at,
    };
  });
  const person = (value: string | null) => (value === null ? null : (personIds.get(value) ?? null));

  return {
    sameTeam,
    people,
    records,
    secrets: tables.record_secrets
      .filter((row) => restored.has(row.record_id))
      .map((row) => ({ record_id: id(row.record_id), data: remapJson(row.data, ids) })),
    access: tables.record_access
      .filter((row) => restored.has(row.record_id))
      .filter((row) => row.person_id === null || personIds.has(row.person_id))
      .map((row) => ({
        record_id: id(row.record_id),
        person_id: person(row.person_id),
        member_role: row.member_role,
      })),
    recordPeople: tables.record_people
      .filter((row) => restored.has(row.record_id) && personIds.has(row.person_id))
      .map((row) => ({
        record_id: id(row.record_id),
        person_id: person(row.person_id) ?? row.person_id,
        relation: row.relation,
      })),
    registrations: (tables.registrations ?? [])
      .filter((row) => !sameTeam || !current.registrationIds.has(row.id))
      .filter((row) =>
        sameTeam
          ? current.recordIds.has(row.game_id) || restored.has(row.game_id)
          : ids.has(row.game_id.toLowerCase()),
      )
      .map((row) => ({
        id: sameTeam ? row.id : current.newId(),
        game_id: id(row.game_id),
        person_id: person(row.person_id),
        character_id:
          row.character_id === null
            ? null
            : sameTeam
              ? row.character_id
              : (ids.get(row.character_id.toLowerCase()) ?? null),
        name: row.name,
        status: row.status,
        is_minor: row.is_minor,
        consent_on_file: row.consent_on_file,
        allergens: row.allergens,
        allergies: row.allergies,
        emergency_contact: row.emergency_contact,
        note: row.note,
      })),
    files: restorable
      .filter((row) => row.kind === 'file')
      .map((row) => ({ recordId: id(row.id), entry: `soubory/${row.id}` })),
    existing: tables.records.length - missing.length,
    missingFiles: missingFileIds.filter((fileId) => !restored.has(fileId)).length,
  };
}
