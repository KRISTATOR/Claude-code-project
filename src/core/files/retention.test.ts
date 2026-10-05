import { describe, expect, it } from 'vitest';
import { versionsToPrune, type VersionInfo } from './retention';

const now = new Date('2026-10-05T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

function versions(ages: number[]): VersionInfo[] {
  return ages.map((age, index) => ({
    id: `v${index + 1}`,
    no: index + 1,
    created_at: daysAgo(age),
    pinned: false,
    is_conflict: false,
  }));
}

describe('versionsToPrune', () => {
  it('keeps everything from the last 30 days', () => {
    expect(versionsToPrune(versions([20, 10, 1]), 'v3', now)).toEqual([]);
  });

  it('keeps the newest 5 older versions and prunes the rest', () => {
    const list = versions([100, 90, 80, 70, 60, 50, 40, 5]);
    expect(versionsToPrune(list, 'v8', now)).toEqual(['v2', 'v1']);
  });

  it('never prunes the current, pinned or conflict versions', () => {
    const list = versions([100, 90, 80, 70, 60, 50, 40, 35]);
    const [first, second] = list;
    if (!first || !second) throw new Error('fixture');
    first.pinned = true;
    second.is_conflict = true;
    expect(versionsToPrune(list, 'v3', now)).toEqual([]);
    expect(versionsToPrune(list, 'v8', now, { keepDays: 30, keepOlder: 1 })).toEqual([
      'v6',
      'v5',
      'v4',
      'v3',
    ]);
  });
});
