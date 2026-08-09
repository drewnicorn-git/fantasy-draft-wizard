import type { DepthChartsData, RankingsData } from '../data/types';

type TimestampedData = Pick<RankingsData, 'builtAt' | 'fetchedAt'> | Pick<DepthChartsData, 'builtAt' | 'fetchedAt'>;

/** Prefer the newest pipeline timestamp so deploy/build time is visible even when raw snapshots are stale. */
export function rankingsUpdatedAt(data: TimestampedData | null | undefined): string {
  if (!data) return '';
  const times = [data.builtAt, data.fetchedAt].filter(Boolean) as string[];
  if (!times.length) return '';
  return times.sort().pop()!;
}
