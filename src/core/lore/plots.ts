import { clueKind, plotThreadKind, readData } from '../kinds';
import type { RecordRow } from '../model';

type Row = Pick<RecordRow, 'id' | 'kind' | 'data' | 'deleted_at'>;

export interface ThreadReach {
  clues: number;
  reachable: number;
}

/**
 * A clue is reachable when it is not cut and someone or somewhere holds it.
 * Threads that are still in play but have no reachable clue cannot be found
 * by players (docs/PLAN.md M3).
 */
export function isReachable(clue: Row): boolean {
  const data = readData(clueKind, clue);
  return data.status !== 'cut' && (data.holder_id !== null || data.location.trim() !== '');
}

export function threadReach(records: Row[]): Map<string, ThreadReach> {
  const live = records.filter((row) => row.deleted_at === null);
  const result = new Map<string, ThreadReach>();
  for (const thread of live.filter((row) => row.kind === 'plot_thread')) {
    result.set(thread.id, { clues: 0, reachable: 0 });
  }
  for (const clue of live.filter((row) => row.kind === 'clue')) {
    const reachable = isReachable(clue);
    for (const id of readData(clueKind, clue).thread_ids) {
      const entry = result.get(id);
      if (!entry) continue;
      entry.clues += 1;
      if (reachable) entry.reachable += 1;
    }
  }
  return result;
}

/** Ids of threads in play (idea or active) with no reachable clue. */
export function unreachableThreads(records: Row[]): string[] {
  const reach = threadReach(records);
  return records
    .filter((row) => row.kind === 'plot_thread' && row.deleted_at === null)
    .filter((row) => {
      const status = readData(plotThreadKind, row).status;
      return (
        (status === 'idea' || status === 'active') && (reach.get(row.id)?.reachable ?? 0) === 0
      );
    })
    .map((row) => row.id);
}
