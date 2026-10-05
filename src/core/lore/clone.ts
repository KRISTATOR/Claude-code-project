import type {
  RecordAccessRow,
  RecordPersonRow,
  RecordRow,
  RecordSecretRow,
  Visibility,
} from '../model';

/**
 * "Clone a game as a sequel" (docs/PLAN.md §3.1): a deep copy of a game and
 * everything in it with new ids. Any string in `data` equal to a copied
 * record's old id is replaced by its new id, which covers relationships,
 * memberships, clue holders, schedule blocks and `[[links]]` in rich text
 * without knowing each kind. Files and folders stay with the original game
 * (their content lives in Storage); links to them keep working.
 */
export interface CloneOptions {
  title: string;
  /** Copy who plays which character and NPC (usually not, for a sequel). */
  keepPeople: boolean;
}

export interface ClonedRecord {
  id: string;
  kind: string;
  title: string;
  world_id: string | null;
  game_id: string | null;
  parent_id: string | null;
  data: Record<string, unknown>;
  visibility: Visibility;
  inherit_audience: boolean;
  sort_key: string;
  tags: string[];
}

export interface CloneResult {
  /** In insertion order: every parent before its children. */
  records: ClonedRecord[];
  secrets: { record_id: string; data: Record<string, unknown> }[];
  access: {
    record_id: string;
    person_id: string | null;
    member_role: RecordAccessRow['member_role'];
  }[];
  people: { record_id: string; person_id: string; relation: RecordPersonRow['relation'] }[];
  /** Old id -> new id. */
  ids: Map<string, string>;
}

const NOT_CLONED = new Set(['file', 'folder']);

export function remapIds(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapIds(item, ids));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, remapIds(item, ids)]),
    );
  }
  return value;
}

export function cloneGame(
  game: RecordRow,
  records: RecordRow[],
  related: {
    secrets: RecordSecretRow[];
    access: RecordAccessRow[];
    people: RecordPersonRow[];
  },
  options: CloneOptions,
  newId: () => string,
): CloneResult {
  // The game's live records, minus files and anything inside a record left out.
  const byId = new Map(records.map((row) => [row.id, row]));
  const left = (row: RecordRow) => row.deleted_at !== null || NOT_CLONED.has(row.kind);
  /** Ancestors inside this game, nearest first (stops at a cycle or outside the game). */
  const ancestors = (row: RecordRow): RecordRow[] => {
    const chain: RecordRow[] = [];
    let current = row;
    while (current.parent_id) {
      const parent = byId.get(current.parent_id);
      if (!parent || parent.id === game.id || parent.game_id !== game.id) break;
      if (chain.includes(parent)) break;
      chain.push(parent);
      current = parent;
    }
    return chain;
  };
  const kept = records
    .filter((row) => row.game_id === game.id && !left(row))
    .map((row) => ({ row, chain: ancestors(row) }))
    .filter(({ chain }) => !chain.some(left))
    // Parents first: a record is inserted after everything above it.
    .sort((a, b) => a.chain.length - b.chain.length);
  const included = new Map<string, RecordRow>([[game.id, game]]);
  for (const { row } of kept) included.set(row.id, row);

  const ids = new Map<string, string>();
  for (const id of included.keys()) ids.set(id, newId());
  const newGameId = ids.get(game.id) ?? '';

  const cloned: ClonedRecord[] = [];
  for (const row of included.values()) {
    const isGame = row.id === game.id;
    const data = remapIds(row.data, ids) as Record<string, unknown>;
    if (isGame) {
      data['status'] = 'planning';
      data['starts_on'] = null;
      data['ends_on'] = null;
    }
    cloned.push({
      id: ids.get(row.id) ?? '',
      kind: row.kind,
      title: isGame ? options.title : row.title,
      world_id: row.world_id,
      game_id: isGame ? null : newGameId,
      parent_id: row.parent_id === null ? null : (ids.get(row.parent_id) ?? row.parent_id),
      data,
      visibility: row.visibility,
      inherit_audience: row.inherit_audience,
      sort_key: row.sort_key,
      tags: [...row.tags],
    });
  }

  return {
    records: cloned,
    secrets: related.secrets
      .filter((secret) => ids.has(secret.record_id))
      .map((secret) => ({
        record_id: ids.get(secret.record_id) ?? '',
        data: remapIds(secret.data, ids) as Record<string, unknown>,
      })),
    access: related.access
      .filter((row) => ids.has(row.record_id))
      .map((row) => ({
        record_id: ids.get(row.record_id) ?? '',
        person_id: row.person_id,
        member_role: row.member_role,
      })),
    people: options.keepPeople
      ? related.people
          .filter((row) => ids.has(row.record_id))
          .map((row) => ({
            record_id: ids.get(row.record_id) ?? '',
            person_id: row.person_id,
            relation: row.relation,
          }))
      : [],
    ids,
  };
}
