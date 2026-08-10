import type { Player, RankDeltaCompare, RankMetric, ScoringFormat, SourceKey } from '../data/types';
import { getActiveLeague, updateActiveLeague } from '../state/leaguesStore';
import { getManualRank } from './manualOrder';
import { SOURCE_LABELS, getAdp, getConsensus, getSourceRank } from './scoring';

export type { RankDeltaCompare, RankMetric } from '../data/types';

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
  const saved = getActiveLeague().rankDeltaCompare;
  if (!saved) return fallback;
  const from = saved.from && metrics.includes(saved.from) ? saved.from : fallback.from;
  let to = saved.to && metrics.includes(saved.to) ? saved.to : fallback.to;
  if (from === to) to = metrics.find((m) => m !== from) ?? fallback.to;
  return { from, to };
}

export function saveRankDeltaCompare(compare: RankDeltaCompare): void {
  updateActiveLeague({ rankDeltaCompare: compare });
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
