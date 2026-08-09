import type { RankingsData } from '../data/types';

/** Prefer the newest pipeline timestamp so deploy/build time is visible even when raw snapshots are stale. */
export function rankingsUpdatedAt(data: RankingsData | null | undefined): string {
  if (!data) return '';
  const times = [data.builtAt, data.fetchedAt].filter(Boolean) as string[];
  if (!times.length) return '';
  return times.sort().pop()!;
}
