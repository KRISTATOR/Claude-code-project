/**
 * NPC schedule (docs/PLAN.md M2): appearances have an actor and a time span in
 * local event time ("2027-05-14T18:30"). Two appearances of one actor that
 * overlap are a clash.
 */
export interface Slot {
  id: string;
  actor: string | null;
  starts_at: string;
  ends_at: string;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Minutes since the Unix epoch for a local event time, or null if malformed. */
export function toMinutes(value: string): number | null {
  const match = LOCAL.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return Date.UTC(y, mo - 1, d, h, mi) / 60_000;
}

export function interval(slot: Pick<Slot, 'starts_at' | 'ends_at'>): [number, number] | null {
  const start = toMinutes(slot.starts_at);
  const end = toMinutes(slot.ends_at);
  if (start === null || end === null || end <= start) return null;
  return [start, end];
}

/** For each appearance, the other appearances of the same actor it overlaps. */
export function findClashes(slots: Slot[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const byActor = new Map<string, { id: string; range: [number, number] }[]>();
  for (const slot of slots) {
    const range = interval(slot);
    if (!slot.actor || !range) continue;
    byActor.set(slot.actor, [...(byActor.get(slot.actor) ?? []), { id: slot.id, range }]);
  }
  for (const list of byActor.values()) {
    list.sort((a, b) => a.range[0] - b.range[0]);
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (!a) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (!b || b.range[0] >= a.range[1]) break;
        result.set(a.id, [...(result.get(a.id) ?? []), b.id]);
        result.set(b.id, [...(result.get(b.id) ?? []), a.id]);
      }
    }
  }
  return result;
}

/**
 * Lanes for drawing one actor's appearances without overlap: each slot gets
 * the first lane that is free at its start. Slots without a valid span get
 * no lane. Returns each slot's lane and the number of lanes per actor.
 */
export function assignLanes(slots: Slot[]): {
  lane: Map<string, number>;
  lanes: Map<string, number>;
} {
  const lane = new Map<string, number>();
  const lanes = new Map<string, number>();
  const byActor = new Map<string, { id: string; range: [number, number] }[]>();
  for (const slot of slots) {
    const range = interval(slot);
    if (!range) continue;
    const actor = slot.actor ?? '';
    byActor.set(actor, [...(byActor.get(actor) ?? []), { id: slot.id, range }]);
  }
  for (const [actor, list] of byActor) {
    list.sort((a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]);
    const freeAt: number[] = [];
    for (const { id, range } of list) {
      let index = freeAt.findIndex((end) => end <= range[0]);
      if (index === -1) index = freeAt.length;
      freeAt[index] = range[1];
      lane.set(id, index);
    }
    lanes.set(actor, Math.max(1, freeAt.length));
  }
  return { lane, lanes };
}

/** Earliest start and latest end over all valid slots (for the timeline axis). */
export function bounds(slots: Pick<Slot, 'starts_at' | 'ends_at'>[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const slot of slots) {
    const range = interval(slot);
    if (!range) continue;
    min = Math.min(min, range[0]);
    max = Math.max(max, range[1]);
  }
  return Number.isFinite(min) ? [min, max] : null;
}

/** "14. 5. 18:30" style label for a minutes value. */
export function minutesLabel(minutes: number): string {
  const date = new Date(minutes * 60_000);
  return `${date.getUTCDate()}. ${date.getUTCMonth() + 1}. ${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes(),
  ).padStart(2, '0')}`;
}
