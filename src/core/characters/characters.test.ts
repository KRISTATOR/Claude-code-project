import { describe, expect, it } from 'vitest';
import { parseBulkNpcs } from './bulk';
import { tieCounts, weaklyTied } from './graph';
import { compareByHouse } from './roster';
import { assignLanes, bounds, findClashes, minutesLabel, toMinutes } from './schedule';

describe('NPC schedule', () => {
  const slot = (id: string, actor: string | null, start: string, end: string) => ({
    id,
    actor,
    starts_at: `2027-05-14T${start}`,
    ends_at: `2027-05-14T${end}`,
  });

  it('finds overlapping appearances of the same actor', () => {
    const clashes = findClashes([
      slot('a', 'ota', '18:00', '19:00'),
      slot('b', 'ota', '18:30', '20:00'),
      slot('c', 'ota', '20:00', '21:00'),
      slot('d', 'eva', '18:00', '19:00'),
      slot('e', null, '18:00', '19:00'),
    ]);
    expect(Object.fromEntries(clashes)).toEqual({ a: ['b'], b: ['a'] });
  });

  it('ignores malformed and empty spans', () => {
    expect(toMinutes('2027-05-14 18:00')).toBeNull();
    expect(toMinutes('2027-13-14T18:00')).toBeNull();
    expect(
      findClashes([slot('a', 'ota', '19:00', '18:00'), slot('b', 'ota', '18:00', '19:30')]).size,
    ).toBe(0);
  });

  it('computes bounds and labels', () => {
    const range = bounds([slot('a', 'x', '18:00', '19:00'), slot('b', 'x', '17:15', '18:00')]);
    expect(range && minutesLabel(range[0])).toBe('14. 5. 17:15');
    expect(range && minutesLabel(range[1])).toBe('14. 5. 19:00');
  });
});

describe('assignLanes', () => {
  it('stacks overlapping appearances of one actor and reuses freed lanes', () => {
    const slot = (id: string, actor: string, from: string, to: string) => ({
      id,
      actor,
      starts_at: `2027-05-14T${from}`,
      ends_at: `2027-05-14T${to}`,
    });
    const { lane, lanes } = assignLanes([
      slot('a', 'kvido', '18:00', '19:00'),
      slot('b', 'kvido', '18:30', '19:30'),
      slot('c', 'kvido', '19:00', '20:00'),
      slot('d', 'bara', '18:00', '19:00'),
      { id: 'bad', actor: 'kvido', starts_at: 'x', ends_at: '' },
    ]);
    expect([lane.get('a'), lane.get('b'), lane.get('c'), lane.get('d')]).toEqual([0, 1, 0, 0]);
    expect(lanes.get('kvido')).toBe(2);
    expect(lanes.get('bara')).toBe(1);
    expect(lane.has('bad')).toBe(false);
  });
});

describe('relationship graph', () => {
  it('counts ties and warns about characters with too few', () => {
    const ties = [
      { from_id: 'a', to_id: 'b' },
      { from_id: 'a', to_id: 'c' },
      { from_id: 'b', to_id: 'c' },
      { from_id: 'd', to_id: 'd' },
    ];
    expect(Object.fromEntries(tieCounts(['a', 'b', 'c', 'd'], ties))).toEqual({
      a: 2,
      b: 2,
      c: 2,
      d: 0,
    });
    expect(weaklyTied(['a', 'b', 'c', 'd'], ties)).toEqual(['d']);
    expect(weaklyTied(['a', 'b', 'c', 'd'], ties, 3)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('parseBulkNpcs', () => {
  it('reads names and ranks with different separators', () => {
    expect(
      parseBulkNpcs('Jan Kos; desátník\nPetr Vrána\tvojín\nKarel Sýkora – kaprál\n\n  Ota  '),
    ).toEqual([
      { name: 'Jan Kos', rank: 'desátník' },
      { name: 'Petr Vrána', rank: 'vojín' },
      { name: 'Karel Sýkora', rank: 'kaprál' },
      { name: 'Ota', rank: '' },
    ]);
  });
  it('expands numbered ranges', () => {
    const soldiers = parseBulkNpcs('Voják {1-3}; vojín');
    expect(soldiers.map((npc) => npc.name)).toEqual(['Voják 1', 'Voják 2', 'Voják 3']);
    expect(parseBulkNpcs('Voják {1-500}')).toHaveLength(200);
  });
  it('keeps hyphenated names intact', () => {
    expect(parseBulkNpcs('Anna Nová-Malá; kuchařka')).toEqual([
      { name: 'Anna Nová-Malá', rank: 'kuchařka' },
    ]);
  });
});

describe('compareByHouse', () => {
  it('sorts house numbers numerically and puts the homeless last', () => {
    const list = [
      { house_number: '10', name: 'Bára' },
      { house_number: '', name: 'Adam' },
      { house_number: '2', name: 'Cyril' },
      { house_number: '2', name: 'Čeněk' },
    ].sort(compareByHouse);
    expect(list.map((item) => item.name)).toEqual(['Cyril', 'Čeněk', 'Bára', 'Adam']);
  });
});
