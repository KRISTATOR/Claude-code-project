import { describe, expect, it } from 'vitest';
import type { EventRow, ReadingRow, RecordRow } from '../model';
import {
  clampTracker,
  following,
  isWarning,
  latestReadings,
  liveState,
  nextUp,
  phaseBlocks,
  sortPhases,
  trackerValue,
  tracks,
} from './live';

let next = 0;
function rec(kind: string, title: string, data: Record<string, unknown> = {}): RecordRow {
  next += 1;
  return {
    id: `id-${String(next).padStart(3, '0')}`,
    team_id: 't',
    kind,
    world_id: null,
    game_id: 'g',
    parent_id: null,
    title,
    data,
    visibility: 'organizers',
    inherit_audience: false,
    sort_key: '',
    tags: [],
    rev: 1,
    created_by: null,
    created_at: '',
    updated_by: null,
    updated_at: '',
    deleted_by: null,
    deleted_at: null,
  };
}

function event(kind: EventRow['kind'], recordId: string | null, at: string): EventRow {
  next += 1;
  return {
    id: `ev-${String(next)}`,
    team_id: 't',
    game_id: 'g',
    kind,
    text: '',
    record_id: recordId,
    at,
    author_id: null,
    author_person: null,
    created_at: at,
    updated_at: at,
  };
}

function reading(
  definition: string,
  subject: string,
  value: number | null,
  at: string,
): ReadingRow {
  next += 1;
  return {
    id: `rd-${String(next)}`,
    team_id: 't',
    game_id: 'g',
    definition_id: definition,
    subject_id: subject,
    value,
    text: '',
    at,
    author_id: null,
    author_person: null,
    created_at: at,
    updated_at: at,
  };
}

const phase0 = rec('phase', 'Příjezd', { label: '0', order: 0 });
const phase1 = rec('phase', 'Obléhání', { label: 'I', order: 1 });
const blockA = rec('block', 'Večer', { phase_id: phase1.id, order: 0 });
const blockB = rec('block', 'Noc', { phase_id: phase1.id, order: 1 });
const phases = [phase1, phase0];
const blocks = [blockB, blockA];

describe('live state', () => {
  it('comes from the latest phase and block events', () => {
    expect(liveState([], phases, blocks)).toEqual({
      phase: null,
      phaseSince: null,
      block: null,
      blockSince: null,
    });
    const events = [
      event('phase', phase0.id, '2027-05-14T16:00:00Z'),
      event('note', null, '2027-05-14T17:00:00Z'),
      event('phase', phase1.id, '2027-05-14T18:00:00Z'),
      event('block', blockA.id, '2027-05-14T18:05:00Z'),
    ];
    expect(liveState(events, phases, blocks)).toMatchObject({
      phase: phase1,
      phaseSince: '2027-05-14T18:00:00Z',
      block: blockA,
    });
  });

  it('a new phase clears the block', () => {
    const events = [
      event('block', blockA.id, '2027-05-14T18:05:00Z'),
      event('phase', phase0.id, '2027-05-14T19:00:00Z'),
    ];
    expect(liveState(events, phases, blocks).block).toBeNull();
  });

  it('knows the running order of phases and blocks', () => {
    expect(sortPhases(phases).map((row) => row.title)).toEqual(['Příjezd', 'Obléhání']);
    expect(phaseBlocks(blocks, phase1).map((row) => row.title)).toEqual(['Večer', 'Noc']);
    expect(following(sortPhases(phases), null)).toBe(phase0);
    expect(following(sortPhases(phases), phase0)).toBe(phase1);
    expect(following(sortPhases(phases), phase1)).toBeNull();
  });
});

describe('next up', () => {
  const doc12 = rec('prop_document', 'Dopis', {
    number: '12',
    phase_id: phase1.id,
    status: 'printed',
  });
  const doc3 = rec('prop_document', 'Vyhláška', { number: '3', phase_id: phase1.id });
  const delivered = rec('prop_document', 'Staré', { phase_id: phase1.id, status: 'delivered' });
  const elsewhere = rec('prop_document', 'Jinde', { phase_id: phase0.id });
  const beatNight = rec('beat', 'Útok', {
    phase_id: phase1.id,
    block_id: blockB.id,
    at: '2027-05-14T23:00',
  });
  const beatAny = rec('beat', 'Zvon', { phase_id: phase1.id, at: '2027-05-14T19:00' });
  const beatDone = rec('beat', 'Hotovo', { phase_id: phase1.id, done: true });
  const appearance = rec('npc_appearance', 'Lapka', { block_id: blockA.id });
  const items = {
    documents: [doc12, doc3, delivered, elsewhere],
    beats: [beatNight, beatAny, beatDone],
    appearances: [appearance],
  };

  it('lists what is left in the current phase and block', () => {
    const state = { phase: phase1, phaseSince: null, block: blockA, blockSince: null };
    expect(nextUp({ state, ...items }).map((item) => item.record.title)).toEqual([
      'Zvon',
      'Lapka',
      'Vyhláška',
      'Dopis',
    ]);
    const night = { ...state, block: blockB };
    expect(nextUp({ state: night, ...items }).map((item) => item.record.title)).toEqual([
      'Zvon',
      'Útok',
      'Vyhláška',
      'Dopis',
    ]);
  });

  it('is empty before the game starts', () => {
    const state = { phase: null, phaseSince: null, block: null, blockSince: null };
    expect(nextUp({ state, ...items })).toEqual([]);
  });
});

describe('trackers', () => {
  const wounds = rec('tracker_definition', 'Zranění', {
    type: 'number',
    min: 0,
    max: 5,
    warn_at: 3,
  });
  const drunk = rec('tracker_definition', 'Opilost', {
    type: 'level',
    levels: ['střízlivý', 'veselý', 'opilý'],
    applies_to: 'both',
  });
  const infected = rec('tracker_definition', 'Nákaza', { type: 'flag', applies_to: 'npcs' });

  it('takes the latest reading, or the initial value', () => {
    const latest = latestReadings([
      reading(wounds.id, 'c1', 2, '2027-05-14T20:00:00Z'),
      reading(wounds.id, 'c1', 1, '2027-05-14T19:00:00Z'),
      reading(wounds.id, 'c2', 4, '2027-05-14T19:30:00Z'),
    ]);
    expect(trackerValue(latest, wounds, 'c1').value).toBe(2);
    expect(trackerValue(latest, wounds, 'c2').value).toBe(4);
    expect(trackerValue(latest, wounds, 'c3')).toEqual({ value: 0, text: '', at: null });
  });

  it('clamps values to the range and warns at the threshold', () => {
    expect(clampTracker(wounds, 7)).toBe(5);
    expect(clampTracker(wounds, -1)).toBe(0);
    expect(clampTracker(drunk, 5)).toBe(2);
    expect(clampTracker(infected, 3)).toBe(1);
    expect(isWarning(wounds, 3)).toBe(true);
    expect(isWarning(wounds, 2)).toBe(false);
    expect(isWarning(drunk, 9)).toBe(false);
  });

  it('applies to characters, NPCs or both', () => {
    expect(tracks(wounds, { kind: 'character' })).toBe(true);
    expect(tracks(wounds, { kind: 'npc' })).toBe(false);
    expect(tracks(drunk, { kind: 'npc' })).toBe(true);
    expect(tracks(infected, { kind: 'character' })).toBe(false);
  });
});
