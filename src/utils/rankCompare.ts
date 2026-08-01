import type { Player, ScoringFormat, SourceKey } from '../data/types';
import { getManualRank } from './manualOrder';
import { SOURCE_LABELS, getAdp, getConsensus, getSourceRank } from './scoring';

export type RankMetric = 'consensus' | 'manual' | 'adp' | SourceKey;

const STORAGE_KEY = 'fdw-rank-delta-compare';

export interface RankDeltaCompare {
  from: RankMetric;
  to: RankMetric;
}

export function availableRankMetrics(sources: SourceKey[]): RankMetric[] {
  return ['consensus', 'manual', 'adp', ...sources];
}

export function rankMetricLabel(metric: RankMetric): string {
  if (metric === 'consensus') return 'Consensus';
  if (metric === 'manual') return 'Manual';
  if (metric === 'adp') return 'ADP';
  return SOURCE_LABELS[metric] ?? metric;
}

export function loadRankDeltaCompare(sources: SourceKey[]): RankDeltaCompare {
  const metrics = availableRankMetrics(sources);
  const fallback: RankDeltaCompare = {
    from: metrics.includes('fantasypros') ? 'fantasypros' : 'consensus',
    to: metrics.includes('espn') ? 'espn' : metrics.find((m) => m !== 'consensus') ?? 'consensus',
  };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<RankDeltaCompare>;
    const from = raw.from && metrics.includes(raw.from) ? raw.from : fallback.from;
    let to = raw.to && metrics.includes(raw.to) ? raw.to : fallback.to;
    if (from === to) to = metrics.find((m) => m !== from) ?? fallback.to;
    return { from, to };
  } catch {
    return fallback;
  }
}

export function saveRankDeltaCompare(compare: RankDeltaCompare): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(compare));
}

export function getPlayerRankMetric(
  player: Player,
  metric: RankMetric,
  scoring: ScoringFormat,
): number | null {
  switch (metric) {
    case 'consensus':
      return getConsensus(player, scoring);
    case 'manual':
      return getManualRank(scoring, player.id);
    case 'adp': {
      const adp = getAdp(player, scoring);
      return adp != null ? Math.round(adp) : null;
    }
    default:
      return getSourceRank(player, metric, scoring);
  }
}

export function getPlayerRankDelta(
  player: Player,
  from: RankMetric,
  to: RankMetric,
  scoring: ScoringFormat,
): number | null {
  const a = getPlayerRankMetric(player, from, scoring);
  const b = getPlayerRankMetric(player, to, scoring);
  if (a == null || b == null) return null;
  return a - b;
}
