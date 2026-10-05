import { useLiveQuery } from 'dexie-react-hooks';
import type { PersonRow, RecordRow } from '@core/model';
import { compareCzech } from '@core/text';
import { useTeam, useWorkspace } from '../app/workspace';

/** Live records of one kind in the current team (trash excluded unless asked). */
export function useRecords(
  kind: string,
  options: { includeDeleted?: boolean } = {},
): RecordRow[] | undefined {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  return useLiveQuery(async () => {
    const rows = await cache.records.where('[team_id+kind]').equals([team.id, kind]).toArray();
    return rows
      .filter((row) => options.includeDeleted || row.deleted_at === null)
      .sort((a, b) => compareCzech(a.title, b.title));
  }, [cache, team.id, kind, options.includeDeleted]);
}

export function useRecord(id: string | null | undefined): RecordRow | undefined {
  const { cache } = useWorkspace();
  return useLiveQuery(async () => (id ? cache.records.get(id) : undefined), [cache, id]);
}

export function useTrash(): RecordRow[] | undefined {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  return useLiveQuery(
    async () =>
      (await cache.records.where('team_id').equals(team.id).toArray())
        .filter((row) => row.deleted_at !== null)
        .sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')),
    [cache, team.id],
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

export function useInvites() {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  return useLiveQuery(
    () => cache.invites.where('team_id').equals(team.id).toArray(),
    [cache, team.id],
  );
}
