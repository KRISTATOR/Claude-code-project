import {
  beatKind,
  blockKind,
  clueKind,
  npcAppearanceKind,
  phaseKind,
  questKind,
  readData,
} from '../kinds';
import type { RecordRow } from '../model';

/**
 * The per-phase checklist (docs/PLAN.md M3), generated from what the phase
 * needs: NPC appearances to prepare, run-of-show beats, clues to place and
 * quests to post, plus the phase's own hand-written tasks. Each item's state
 * comes from its record, so ticking it in the checklist updates the record.
 */
export type ChecklistItem =
  | { type: 'appearance'; key: string; record_id: string; title: string; done: boolean }
  | { type: 'beat'; key: string; record_id: string; title: string; at: string; done: boolean }
  | { type: 'clue'; key: string; record_id: string; title: string; location: string; done: boolean }
  | { type: 'quest'; key: string; record_id: string; title: string; done: boolean }
  | { type: 'task'; key: string; record_id: string; task_id: string; title: string; done: boolean };

type Row = Pick<RecordRow, 'id' | 'kind' | 'title' | 'data' | 'deleted_at'>;

export function phaseChecklist(phase: Row, records: Row[]): ChecklistItem[] {
  const live = records.filter((row) => row.deleted_at === null);
  const blockIds = new Set(
    live
      .filter((row) => row.kind === 'block' && readData(blockKind, row).phase_id === phase.id)
      .map((row) => row.id),
  );
  const items: ChecklistItem[] = [];

  for (const row of live.filter((item) => item.kind === 'npc_appearance')) {
    const data = readData(npcAppearanceKind, row);
    if (!data.block_id || !blockIds.has(data.block_id)) continue;
    items.push({
      type: 'appearance',
      key: `appearance:${row.id}`,
      record_id: row.id,
      title: row.title,
      done: data.prep_status === 'done',
    });
  }
  const beats = live
    .filter((item) => item.kind === 'beat')
    .map((row) => ({ row, data: readData(beatKind, row) }))
    .filter(
      ({ data }) =>
        data.phase_id === phase.id || (data.block_id !== null && blockIds.has(data.block_id)),
    )
    .sort((a, b) => a.data.at.localeCompare(b.data.at));
  for (const { row, data } of beats) {
    items.push({
      type: 'beat',
      key: `beat:${row.id}`,
      record_id: row.id,
      title: row.title,
      at: data.at,
      done: data.done,
    });
  }
  for (const row of live.filter((item) => item.kind === 'clue')) {
    const data = readData(clueKind, row);
    if (data.phase_id !== phase.id || data.status === 'cut') continue;
    items.push({
      type: 'clue',
      key: `clue:${row.id}`,
      record_id: row.id,
      title: row.title,
      location: data.location,
      done: data.status === 'placed' || data.status === 'found',
    });
  }
  for (const row of live.filter((item) => item.kind === 'quest')) {
    const data = readData(questKind, row);
    if (data.phase_id !== phase.id) continue;
    items.push({
      type: 'quest',
      key: `quest:${row.id}`,
      record_id: row.id,
      title: row.title,
      done: data.status !== 'draft',
    });
  }
  for (const task of readData(phaseKind, phase).tasks) {
    items.push({
      type: 'task',
      key: `task:${task.id}`,
      record_id: phase.id,
      task_id: task.id,
      title: task.text,
      done: task.done,
    });
  }
  return items;
}
