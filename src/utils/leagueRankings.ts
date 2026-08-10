import type { LeagueScoringSettings, Player, ScoringFormat, SourceKey } from '../data/types';
import { normalizeReceptionPoints } from './leagueSettings';

/** Blend std/ppr rank values for custom reception scoring. */
export function blendRankValue(
  std: number | null | undefined,
  ppr: number | null | undefined,
  receptionPoints: number,
): number | null {
  const weight = normalizeReceptionPoints(receptionPoints);
  if (weight <= 0) return std ?? ppr ?? null;
  if (weight >= 1) return ppr ?? std ?? null;
  if (std == null && ppr == null) return null;
  if (std == null) return ppr!;
  if (ppr == null) return std;
  return Math.round(std + (ppr - std) * weight);
}

export function getLeagueConsensus(
  player: Player,
  settings: LeagueScoringSettings,
  sources: Iterable<SourceKey>,
): number | null {
  const weight = normalizeReceptionPoints(settings.receptionPoints);
  if (weight === 0) return computeFromSide(player, 'std', sources);
  if (weight === 1) return computeFromSide(player, 'ppr', sources);
  const std = computeFromSide(player, 'std', sources);
  const ppr = computeFromSide(player, 'ppr', sources);
  return blendRankValue(std, ppr, weight);
}

function computeFromSide(
  player: Player,
  scoring: ScoringFormat,
  sources: Iterable<SourceKey>,
): number | null {
  const ranks = player.ranks[scoring];
  const values: number[] = [];
  for (const source of sources) {
    const rank = ranks[source];
    if (rank != null) values.push(rank);
  }
  if (!values.length) return player.consensus[scoring];
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function getLeagueAdp(player: Player, settings: LeagueScoringSettings): number | null {
  return blendRankValue(player.adp.std, player.adp.ppr, settings.receptionPoints);
}

export function getLeaguePosRank(player: Player, settings: LeagueScoringSettings): number | null {
  return blendRankValue(player.posRank.std, player.posRank.ppr, settings.receptionPoints);
}

export function getLeagueSourceRank(
  player: Player,
  source: SourceKey,
  settings: LeagueScoringSettings,
): number | null {
  return blendRankValue(player.ranks.std[source], player.ranks.ppr[source], settings.receptionPoints);
}
