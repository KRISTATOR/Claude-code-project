import { phaseKind, readData, sleepingPlanKind } from '../kinds';
import type { RecordRow } from '../model';

/**
 * The sleeping plan through the game: everyone sleeps where their latest
 * assignment (by phase) puts them; a place over its capacity is flagged.
 */
export interface PhaseOccupancy {
  /** null = before the first phase (arrival). */
  phase_id: string | null;
  /** Place id -> assignment ids sleeping there. */
  places: Map<string, string[]>;
  /** Place ids with more people than beds. */
  over: string[];
  /** Assignment ids without a place. */
  homeless: string[];
}

export function occupancy(plan: RecordRow, phases: RecordRow[]): PhaseOccupancy[] {
  const data = readData(sleepingPlanKind, plan);
  const ordered = [...phases].sort(
    (a, b) => readData(phaseKind, a).order - readData(phaseKind, b).order,
  );
  const position = new Map(ordered.map((phase, index) => [phase.id, index]));
  const steps: (string | null)[] = [null, ...ordered.map((phase) => phase.id)];
  const who = (assignment: { person_id: string | null; name: string; id: string }) =>
    assignment.person_id ?? `name:${assignment.name.trim().toLowerCase()}`;

  return steps.map((phaseId, stepIndex) => {
    // The latest assignment per person that has started by this step.
    const current = new Map<string, (typeof data.assignments)[number]>();
    for (const assignment of data.assignments) {
      const start =
        assignment.from_phase_id === null ? 0 : (position.get(assignment.from_phase_id) ?? -2) + 1;
      if (start > stepIndex || start < 0) continue;
      const key = who(assignment);
      const previous = current.get(key);
      const previousStart =
        previous?.from_phase_id === null || previous === undefined
          ? 0
          : (position.get(previous.from_phase_id) ?? -2) + 1;
      if (!previous || start >= previousStart) current.set(key, assignment);
    }
    const places = new Map<string, string[]>(data.places.map((place) => [place.id, []]));
    const homeless: string[] = [];
    for (const assignment of current.values()) {
      const list = assignment.place_id ? places.get(assignment.place_id) : undefined;
      if (list) list.push(assignment.id);
      else homeless.push(assignment.id);
    }
    const over = data.places
      .filter((place) => (places.get(place.id)?.length ?? 0) > place.capacity)
      .map((place) => place.id);
    return { phase_id: phaseId, places, over, homeless };
  });
}
