import { useLiveQuery } from 'dexie-react-hooks';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PersonRow, RecordPersonRow, RecordRow, RecordSecretRow } from '@core/model';
import { compareCzech } from '@core/text';
import { usePreview, useRecordFilter } from '../app/preview';
import { useTeam, useWorkspace } from '../app/workspace';

/**
 * Every read of records goes through here, so "view as player" filters the
 * whole UI in one place (docs/PLAN.md §2.4).
 */
/** A stable empty list for `?? NONE` (a fresh `[]` would re-run memos every render). */
export const NONE: RecordRow[] = [];

export function useTeamRecords(
  predicate: (record: RecordRow) => boolean,
  /** Identifies the predicate (it is usually an inline arrow). */
  key = '',
  options: { includeDeleted?: boolean } = {},
): RecordRow[] | undefined {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  const visible = useRecordFilter();
  const preview = usePreview();
  const includeDeleted = options.includeDeleted ?? false;
  const rows = useLiveQuery(
    async () => cache.records.where('team_id').equals(team.id).toArray(),
    [cache, team.id],
  );
  return useMemo(
    () =>
      rows
        ?.filter(
          (row) => (includeDeleted || row.deleted_at === null) && visible(row) && predicate(row),
        )
        .sort((a, b) => compareCzech(a.title, b.title)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, preview, includeDeleted, key],
  );
}

/** Live records of one kind in the current team (trash excluded unless asked). */
export function useRecords(
  kind: string,
  options: { includeDeleted?: boolean } = {},
): RecordRow[] | undefined {
  return useTeamRecords((row) => row.kind === kind, kind, options);
}

/** Records of a kind inside one game. */
export function useGameRecords(
  kind: string,
  gameId: string | null | undefined,
): RecordRow[] | undefined {
  return useTeamRecords(
    (row) => row.kind === kind && gameId != null && row.game_id === gameId,
    `${kind}:${gameId ?? ''}`,
  );
}

export function useRecord(id: string | null | undefined): RecordRow | undefined {
  const { cache } = useWorkspace();
  const visible = useRecordFilter();
  const row = useLiveQuery(async () => (id ? cache.records.get(id) : undefined), [cache, id]);
  return row && visible(row) ? row : undefined;
}

/** A record's organizer-only part. Never available in "view as player". */
export function useSecret(id: string | null | undefined): RecordSecretRow | undefined {
  const { cache } = useWorkspace();
  const preview = usePreview();
  const row = useLiveQuery(async () => (id ? cache.secrets.get(id) : undefined), [cache, id]);
  return preview ? undefined : row;
}

export function useTrash(): RecordRow[] | undefined {
  const rows = useTeamRecords((row) => row.deleted_at !== null, 'trash', { includeDeleted: true });
  return useMemo(
    () => rows?.sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')),
    [rows],
  );
}

export function usePeople(): PersonRow[] | undefined {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  return useLiveQuery(
    async () =>
      (await cache.people.where('team_id').equals(team.id).toArray())
        .filter((person) => person.deleted_at === null)
        .sort((a, b) => compareCzech(a.display_name, b.display_name)),
    [cache, team.id],
  );
}

export function useMembers() {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  return useLiveQuery(
    () => cache.members.where('team_id').equals(team.id).toArray(),
    [cache, team.id],
  );
}

export function useAccess(recordId: string) {
  const { cache } = useWorkspace();
  return useLiveQuery(
    () => cache.access.where('record_id').equals(recordId).toArray(),
    [cache, recordId],
  );
}

/** People attached to records of the team (players of characters, actors of NPCs). */
export function useAttachments(): RecordPersonRow[] | undefined {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  return useLiveQuery(
    () => cache.recordPeople.where('team_id').equals(team.id).toArray(),
    [cache, team.id],
  );
}

export function useInvites() {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  return useLiveQuery(
    () => cache.invites.where('team_id').equals(team.id).toArray(),
    [cache, team.id],
  );
}

// --- Current game ----------------------------------------------------------

interface CurrentGame {
  game: RecordRow | undefined;
  games: RecordRow[];
  setGameId: (id: string) => void;
}

const CurrentGameContext = createContext<CurrentGame | null>(null);

/** Most tools work on one game at a time; the choice is remembered per team. */
export function CurrentGameProvider({ children }: { children: ReactNode }) {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  const games = useRecords('game') ?? NONE;
  const [gameId, setGameIdState] = useState<string | null>(null);
  const key = `currentGame:${team.id}`;

  useEffect(() => {
    void cache.getMeta<string>(key).then((saved) => {
      if (saved) setGameIdState(saved);
    });
  }, [cache, key]);

  const game = games.find((row) => row.id === gameId) ?? games[0];
  const value = useMemo<CurrentGame>(
    () => ({
      game,
      games,
      setGameId: (id) => {
        setGameIdState(id);
        void cache.setMeta(key, id);
      },
    }),
    [game, games, cache, key],
  );
  return createElement(CurrentGameContext.Provider, { value }, children);
}

export function useCurrentGame(): CurrentGame {
  const value = useContext(CurrentGameContext);
  if (!value) throw new Error('useCurrentGame outside CurrentGameProvider');
  return value;
}
