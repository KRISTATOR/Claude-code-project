import {
  beatKind,
  blockKind,
  npcAppearanceKind,
  phaseKind,
  propDocumentKind,
  readData,
  trackerDefinitionKind,
} from '../kinds';
import { compareNumbers } from '../print/documents';
import type { EventRow, ReadingRow, RecordRow } from '../model';
import { compareCzech } from '../text';

/**
 * The live game (M7). Where the game is now is not stored anywhere: it is
 * the latest "phase" and "block" entries of the event log, so starting the
 * next phase works offline through the outbox like any other log entry.
 */
export interface LiveState {
  phase: RecordRow | null;
  phaseSince: string | null;
  block: RecordRow | null;
  blockSince: string | null;
}

const byTime = (a: Pick<EventRow, 'at' | 'created_at'>, b: Pick<EventRow, 'at' | 'created_at'>) =>
  a.at.localeCompare(b.at) || a.created_at.localeCompare(b.created_at);

/** Events in the order they happened. */
export function sortEvents<T extends Pick<EventRow, 'at' | 'created_at'>>(
  events: readonly T[],
): T[] {
  return [...events].sort(byTime);
}

export function liveState(
  events: readonly EventRow[],
  phases: readonly RecordRow[],
  blocks: readonly RecordRow[],
): LiveState {
  const sorted = sortEvents(events);
  const lastOf = (kind: EventRow['kind']) =>
    sorted.filter((event) => event.kind === kind && event.record_id).at(-1);
  const phaseEvent = lastOf('phase');
  const phase = phases.find((row) => row.id === phaseEvent?.record_id) ?? null;
  const blockEvent = lastOf('block');
  // A block belongs to the phase it was started in; a new phase clears it.
  const blockCurrent =
    blockEvent && (!phaseEvent || byTime(blockEvent, phaseEvent) >= 0) ? blockEvent : undefined;
  const block = blocks.find((row) => row.id === blockCurrent?.record_id) ?? null;
  return {
    phase,
    phaseSince: phase ? (phaseEvent?.at ?? null) : null,
    block,
    blockSince: block ? (blockCurrent?.at ?? null) : null,
  };
}

export function sortPhases(phases: readonly RecordRow[]): RecordRow[] {
  return [...phases].sort(
    (a, b) =>
      readData(phaseKind, a).order - readData(phaseKind, b).order || compareCzech(a.title, b.title),
  );
}

/** The blocks of a phase in running order. */
export function phaseBlocks(blocks: readonly RecordRow[], phase: RecordRow | null): RecordRow[] {
  if (!phase) return [];
  return blocks
    .filter((row) => readData(blockKind, row).phase_id === phase.id)
    .sort((a, b) => {
      const da = readData(blockKind, a);
      const db = readData(blockKind, b);
      return da.order - db.order || da.starts_at.localeCompare(db.starts_at);
    });
}

/** The item after `current` in `list` (the first one when nothing is current). */
export function following(list: readonly RecordRow[], current: RecordRow | null): RecordRow | null {
  if (!current) return list[0] ?? null;
  const index = list.findIndex((row) => row.id === current.id);
  return index >= 0 ? (list[index + 1] ?? null) : (list[0] ?? null);
}

export type NextKind = 'document' | 'beat' | 'appearance';
export interface NextItem {
  kind: NextKind;
  record: RecordRow;
}

/**
 * "Na řadě": what still has to happen in the current phase and block —
 * documents to deliver (in delivery order), run-of-show beats and NPC
 * appearances not yet marked done.
 */
export function nextUp(input: {
  state: LiveState;
  documents: readonly RecordRow[];
  beats: readonly RecordRow[];
  appearances: readonly RecordRow[];
}): NextItem[] {
  const { phase, block } = input.state;
  if (!phase) return [];
  const documents = input.documents
    .filter((row) => {
      const data = readData(propDocumentKind, row);
      return data.phase_id === phase.id && data.status !== 'delivered';
    })
    .sort((a, b) => {
      const da = readData(propDocumentKind, a);
      const db = readData(propDocumentKind, b);
      return da.delivery_order - db.delivery_order || compareNumbers(da.number, db.number);
    })
    .map((record) => ({ kind: 'document' as const, record }));
  const beats = input.beats
    .filter((row) => {
      const data = readData(beatKind, row);
      return (
        data.phase_id === phase.id &&
        !data.done &&
        (data.block_id === null || data.block_id === (block?.id ?? data.block_id))
      );
    })
    .sort((a, b) => readData(beatKind, a).at.localeCompare(readData(beatKind, b).at))
    .map((record) => ({ kind: 'beat' as const, record }));
  const appearances = block
    ? input.appearances
        .filter((row) => {
          const data = readData(npcAppearanceKind, row);
          return data.block_id === block.id && !data.done;
        })
        .sort((a, b) =>
          readData(npcAppearanceKind, a).starts_at.localeCompare(
            readData(npcAppearanceKind, b).starts_at,
          ),
        )
        .map((record) => ({ kind: 'appearance' as const, record }))
    : [];
  return [...beats, ...appearances, ...documents];
}

// --- Trackers -----------------------------------------------------------------

export interface TrackerValue {
  value: number;
  text: string;
  at: string | null;
}

/** The latest reading of each (tracker, subject), keyed "definition:subject". */
export function latestReadings(readings: readonly ReadingRow[]): Map<string, ReadingRow> {
  const latest = new Map<string, ReadingRow>();
  for (const reading of sortEvents(readings)) {
    latest.set(`${reading.definition_id}:${reading.subject_id}`, reading);
  }
  return latest;
}

export function trackerValue(
  latest: Map<string, ReadingRow>,
  definition: RecordRow,
  subjectId: string,
): TrackerValue {
  const reading = latest.get(`${definition.id}:${subjectId}`);
  if (!reading || reading.value === null) {
    return {
      value: readData(trackerDefinitionKind, definition).initial,
      text: reading?.text ?? '',
      at: reading?.at ?? null,
    };
  }
  return { value: reading.value, text: reading.text, at: reading.at };
}

/** Keeps a value inside the tracker's range (whole numbers for levels and flags). */
export function clampTracker(definition: RecordRow, value: number): number {
  const data = readData(trackerDefinitionKind, definition);
  let result = data.type === 'number' ? value : Math.round(value);
  if (data.type === 'flag') return result > 0 ? 1 : 0;
  const max = data.type === 'level' && data.levels.length > 0 ? data.levels.length - 1 : data.max;
  result = Math.max(data.min, result);
  if (max !== null) result = Math.min(max, result);
  return result;
}

export function isWarning(definition: RecordRow, value: number): boolean {
  const warnAt = readData(trackerDefinitionKind, definition).warn_at;
  return warnAt !== null && value >= warnAt;
}

/** Whether a tracker is kept for this kind of record. */
export function tracks(definition: RecordRow, subject: Pick<RecordRow, 'kind'>): boolean {
  const appliesTo = readData(trackerDefinitionKind, definition).applies_to;
  if (appliesTo === 'both') return subject.kind === 'character' || subject.kind === 'npc';
  return subject.kind === (appliesTo === 'npcs' ? 'npc' : 'character');
}
