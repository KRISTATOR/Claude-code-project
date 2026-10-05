import { describe, expect, it } from 'vitest';
import { currencyKind, readData } from '../kinds';
import type { RecordRow } from '../model';
import { computeHoldings } from './ledger';
import { availableIn, czechForm, formatMoney, phasePrices } from './money';
import { occupancy } from './sleeping';
import { durationLabel, placeKey, routePlaces, travelMinutes, walkingTrip } from './travel';

let next = 0;
function rec(
  kind: string,
  title: string,
  data: Record<string, unknown> = {},
  extra: Partial<RecordRow> = {},
): RecordRow {
  next += 1;
  return {
    id: `id-${String(next).padStart(3, '0')}`,
    team_id: 't',
    kind,
    world_id: null,
    game_id: null,
    parent_id: null,
    title,
    data,
    visibility: 'organizers',
    inherit_audience: false,
    sort_key: '',
    tags: [],
    rev: 1,
    created_by: null,
    created_at: `2026-10-05T10:00:${String(next % 60).padStart(2, '0')}Z`,
    updated_by: null,
    updated_at: '',
    deleted_by: null,
    deleted_at: null,
    ...extra,
  };
}

const currency = readData(currencyKind, { data: {} });

describe('money', () => {
  it('uses Czech plural forms', () => {
    const forms = { one: 'orel', few: 'orly', many: 'orlů' };
    expect([0, 1, 2, 4, 5, 22, 1.5].map((n) => czechForm(n, forms))).toEqual([
      'orlů',
      'orel',
      'orly',
      'orly',
      'orlů',
      'orlů',
      'orlů',
    ]);
  });

  it('formats amounts with the sub-unit', () => {
    expect(formatMoney(1.5, currency)).toBe('1 orel 5 grošů');
    expect(formatMoney(0.3, currency)).toBe('3 groše');
    expect(formatMoney(2, currency)).toBe('2 orly');
    expect(formatMoney(0, currency)).toBe('0 orlů');
    expect(formatMoney(-12.1, currency)).toBe('−12 orlů 1 groš');
    expect(formatMoney(2.5, { ...currency, sub_per_unit: 0 })).toBe('2,5 orlů');
  });

  it('applies the phase multiplier and availability', () => {
    const item = rec('item', 'Chléb', { price: 1.2, buyback_price: 0.5, phase_ids: ['p1'] });
    const always = rec('item', 'Voda', { price: 0.1 });
    const priced = { ...currency, multipliers: { p2: 2 } };
    expect(phasePrices(item, priced, 'p2')).toEqual({ price: 2.4, buyback: 1 });
    expect(phasePrices(item, priced, 'p1')).toEqual({ price: 1.2, buyback: 0.5 });
    expect(availableIn(item, 'p1')).toBe(true);
    expect(availableIn(item, 'p2')).toBe(false);
    expect(availableIn(always, null)).toBe(true);
  });
});

describe('ledger', () => {
  it('starts from the catalogue owners and applies transfers in time order', () => {
    const bread = rec('item', 'Chléb', { starting_owner_id: 'baker', starting_quantity: 5 });
    const sword = rec('item', 'Meč');
    const transfers = [
      rec('transfer', 't2', {
        item_id: bread.id,
        quantity: 2,
        from_id: 'hana',
        to_id: null,
        at: '2027-05-14T19:00:00Z',
      }),
      rec('transfer', 't1', {
        item_id: bread.id,
        quantity: 3,
        from_id: 'baker',
        to_id: 'hana',
        at: '2027-05-14T18:00:00Z',
      }),
      rec('transfer', 't3', {
        item_id: sword.id,
        quantity: 1,
        from_id: null,
        to_id: 'hana',
        at: '2027-05-14T20:00:00Z',
      }),
      rec('transfer', 't4', {
        item_id: sword.id,
        quantity: 2,
        from_id: 'ivo',
        to_id: 'hana',
        at: '2027-05-14T21:00:00Z',
      }),
    ];
    const { holdings, problems } = computeHoldings([bread, sword], transfers);
    expect(Object.fromEntries(holdings.get('hana') ?? [])).toEqual({
      [bread.id]: 1,
      [sword.id]: 3,
    });
    expect(Object.fromEntries(holdings.get('baker') ?? [])).toEqual({ [bread.id]: 2 });
    expect(problems).toEqual([
      { transfer_id: transfers[3]?.id, holder_id: 'ivo', item_id: sword.id, missing: 2 },
    ]);
  });
});

describe('travel', () => {
  const routes = [
    rec('travel_route', 'a', { from_name: 'Lipnov', to_name: 'Hrad', minutes: 120 }),
    rec('travel_route', 'b', { from_name: 'Hrad', to_name: 'Klášter', minutes: 60 }),
    rec('travel_route', 'c', { from_name: 'Lipnov', to_name: 'Klášter', minutes: 240 }),
    rec('travel_route', 'd', { from_id: 'mlyn', from_name: 'Mlýn', to_name: 'Řeka', minutes: 15 }),
  ];
  it('finds the quickest connection in both directions', () => {
    const lipnov = placeKey(null, 'Lipnov');
    const klaster = placeKey(null, 'Klášter');
    expect(walkingTrip(routes, klaster, lipnov)).toEqual({
      minutes: 180,
      path: [klaster, placeKey(null, 'Hrad'), lipnov],
    });
    expect(walkingTrip(routes, lipnov, 'mlyn')).toBeNull();
    expect(routePlaces(routes)).toHaveLength(5);
  });

  it('applies mounts and vehicles', () => {
    expect(travelMinutes(180, [3])).toBe(60);
    expect(travelMinutes(180, [3, 0.75])).toBe(80);
    expect(travelMinutes(90, [])).toBe(90);
    expect(durationLabel(80)).toBe('1 h 20 min');
    expect(durationLabel(45)).toBe('45 min');
    expect(durationLabel(120)).toBe('2 h');
  });
});

describe('sleeping plan', () => {
  it('follows moves by phase and flags full places', () => {
    const p1 = rec('phase', 'I', { order: 1 });
    const p2 = rec('phase', 'II', { order: 2 });
    const plan = rec('sleeping_plan', 'Spaní', {
      places: [
        { id: 'stodola', name: 'Stodola', capacity: 2, map_object_id: null },
        { id: 'kobka', name: 'Kobka', capacity: 1, map_object_id: null },
      ],
      assignments: [
        { id: 'a1', person_id: 'hana', name: 'Hana', place_id: 'stodola', from_phase_id: null },
        { id: 'a2', person_id: 'ivo', name: 'Ivo', place_id: 'stodola', from_phase_id: null },
        { id: 'a3', person_id: 'ota', name: 'Ota', place_id: 'stodola', from_phase_id: p1.id },
        { id: 'a4', person_id: 'ivo', name: 'Ivo', place_id: 'kobka', from_phase_id: p2.id },
        { id: 'a5', person_id: null, name: 'Host', place_id: null, from_phase_id: null },
      ],
    });
    const steps = occupancy(plan, [p2, p1]);
    expect(steps.map((step) => step.phase_id)).toEqual([null, p1.id, p2.id]);
    expect(steps[0]?.places.get('stodola')).toEqual(['a1', 'a2']);
    expect(steps[1]?.over).toEqual(['stodola']);
    expect(steps[2]?.places.get('stodola')).toEqual(['a1', 'a3']);
    expect(steps[2]?.places.get('kobka')).toEqual(['a4']);
    expect(steps[2]?.over).toEqual([]);
    expect(steps[0]?.homeless).toEqual(['a5']);
  });
});
