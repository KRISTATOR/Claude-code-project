/** Relationship-graph helpers (docs/PLAN.md M2). */
export interface Tie {
  from_id: string;
  to_id: string;
}

/** How many relationships touch each character (both directions count once each). */
export function tieCounts(characterIds: string[], ties: Tie[]): Map<string, number> {
  const counts = new Map(characterIds.map((id) => [id, 0]));
  for (const tie of ties) {
    if (tie.from_id === tie.to_id) continue;
    if (counts.has(tie.from_id)) counts.set(tie.from_id, (counts.get(tie.from_id) ?? 0) + 1);
    if (counts.has(tie.to_id)) counts.set(tie.to_id, (counts.get(tie.to_id) ?? 0) + 1);
  }
  return counts;
}

/** Characters with fewer than `minimum` ties: they risk having nothing to play. */
export function weaklyTied(characterIds: string[], ties: Tie[], minimum = 2): string[] {
  const counts = tieCounts(characterIds, ties);
  return characterIds.filter((id) => (counts.get(id) ?? 0) < minimum);
}
