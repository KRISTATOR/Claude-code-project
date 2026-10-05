/**
 * Which old file versions may be deleted to stay inside the Free tier's 1 GB
 * (docs/PLAN.md §2.12). Default: keep everything from the last 30 days, then
 * the newest 5 older ones, plus pinned versions; never the current version or
 * a conflict version nobody has looked at yet.
 */
export interface RetentionPolicy {
  keepDays: number;
  keepOlder: number;
}

export const defaultRetention: RetentionPolicy = { keepDays: 30, keepOlder: 5 };

export interface VersionInfo {
  id: string;
  no: number;
  created_at: string;
  pinned: boolean;
  is_conflict: boolean;
}

export function versionsToPrune(
  versions: VersionInfo[],
  currentVersionId: string | null,
  now: Date,
  policy: RetentionPolicy = defaultRetention,
): string[] {
  const cutoff = now.getTime() - policy.keepDays * 24 * 60 * 60 * 1000;
  const older = versions
    .filter((v) => v.id !== currentVersionId && !v.pinned && !v.is_conflict)
    .filter((v) => new Date(v.created_at).getTime() < cutoff)
    .sort((a, b) => b.no - a.no);
  return older.slice(policy.keepOlder).map((v) => v.id);
}
