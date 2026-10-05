import { readData, travelRouteKind } from '../kinds';
import type { RecordRow } from '../model';

/**
 * Travel between off-site in-world places: routes give walking minutes in
 * both directions; the quickest connection is found over all routes
 * (Dijkstra). Mounts and vehicles multiply the speed (horse 3, mule 2,
 * ox 1.5, a cart 0.75); several apply together.
 */
export interface Place {
  key: string;
  name: string;
}

/** A place's key: its record id, or its folded name when it has no record. */
export function placeKey(id: string | null, name: string): string {
  return id ?? `name:${name.trim().toLowerCase()}`;
}

export function routePlaces(routes: RecordRow[]): Place[] {
  const places = new Map<string, Place>();
  for (const route of routes) {
    const data = readData(travelRouteKind, route);
    places.set(placeKey(data.from_id, data.from_name), {
      key: placeKey(data.from_id, data.from_name),
      name: data.from_name,
    });
    places.set(placeKey(data.to_id, data.to_name), {
      key: placeKey(data.to_id, data.to_name),
      name: data.to_name,
    });
  }
  return [...places.values()];
}

export interface Trip {
  minutes: number;
  /** Place keys from start to end. */
  path: string[];
}

/** Quickest walking connection, or null when the places are not connected. */
export function walkingTrip(routes: RecordRow[], from: string, to: string): Trip | null {
  const edges = new Map<string, { to: string; minutes: number }[]>();
  const link = (a: string, b: string, minutes: number) =>
    edges.set(a, [...(edges.get(a) ?? []), { to: b, minutes }]);
  for (const route of routes.filter((row) => row.deleted_at === null)) {
    const data = readData(travelRouteKind, route);
    const a = placeKey(data.from_id, data.from_name);
    const b = placeKey(data.to_id, data.to_name);
    link(a, b, data.minutes);
    link(b, a, data.minutes);
  }
  const best = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const open = new Set([from]);
  while (open.size > 0) {
    let current = '';
    let currentMinutes = Infinity;
    for (const key of open) {
      const minutes = best.get(key) ?? Infinity;
      if (minutes < currentMinutes) {
        current = key;
        currentMinutes = minutes;
      }
    }
    open.delete(current);
    if (current === to) break;
    for (const edge of edges.get(current) ?? []) {
      const minutes = currentMinutes + edge.minutes;
      if (minutes < (best.get(edge.to) ?? Infinity)) {
        best.set(edge.to, minutes);
        previous.set(edge.to, current);
        open.add(edge.to);
      }
    }
  }
  const minutes = best.get(to);
  if (minutes === undefined) return null;
  const path = [to];
  while (path[0] !== from) {
    const before = previous.get(path[0] ?? '');
    if (before === undefined) break;
    path.unshift(before);
  }
  return { minutes, path };
}

/** Travel time with mounts and vehicles applied (their factors multiply). */
export function travelMinutes(walking: number, factors: number[]): number {
  const speed = factors.filter((factor) => factor > 0).reduce((total, factor) => total * factor, 1);
  return walking / speed;
}

/** "2 h 15 min" style, rounded to whole minutes. */
export function durationLabel(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}
