import type { DepthChartsData, InSeasonData, InjuriesData, RankingsData } from '../data/types';

type TimestampedData = Pick<RankingsData, 'builtAt' | 'fetchedAt'> | Pick<DepthChartsData, 'builtAt' | 'fetchedAt'>;

/** Prefer the newest pipeline timestamp so deploy/build time is visible even when raw snapshots are stale. */
export function rankingsUpdatedAt(data: TimestampedData | null | undefined): string {
  if (!data) return '';
  const times = [data.builtAt, data.fetchedAt].filter(Boolean) as string[];
  if (!times.length) return '';
  return times.sort().pop()!;
}

export function formatDataFreshness(data: TimestampedData | null | undefined): string {
  const at = rankingsUpdatedAt(data);
  if (!at) return '';
  return new Date(at).toLocaleString();
}

export function formatInSeasonFreshness(data: InSeasonData | null | undefined): string {
  if (!data) return '';
  const at = data.fetchedAt ?? data.builtAt;
  if (!at) return '';
  return `Week ${data.currentWeek} · proj W${data.projectionWeek} · updated ${new Date(at).toLocaleString()}`;
}

export function formatInjuryFreshness(data: InjuriesData | null | undefined): string {
  if (!data) return '';
  const at = data.fetchedAt ?? data.builtAt;
  if (!at) return '';
  return `${data.entries.length} entries · updated ${new Date(at).toLocaleString()}`;
}

export function formatDepthFreshness(data: DepthChartsData | null | undefined): string {
  if (!data) return '';
  const teams = data.teams ? Object.keys(data.teams).length : 0;
  const at = rankingsUpdatedAt(data);
  if (!at) return '';
  return `${teams} teams · updated ${new Date(at).toLocaleString()}`;
}
