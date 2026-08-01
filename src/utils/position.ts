import type { Player, ScoringFormat } from '../data/types';

const POS_ORDER: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 4,
  K: 5,
  DST: 6,
  DEF: 6,
};

export function posSortOrder(pos: string): number {
  return POS_ORDER[pos.toUpperCase()] ?? 99;
}

export function posCssClass(pos: string): string {
  const key = pos.toUpperCase();
  if (key === 'DEF') return 'pos-dst';
  if (POS_ORDER[key]) return `pos-${key.toLowerCase()}`;
  return 'pos-other';
}

export function getTeamDepthValue(player: Player): number | null {
  return player.depth ?? null;
}

export function formatTeamDepthLabel(player: Player): string {
  const depth = getTeamDepthValue(player);
  if (depth == null) return '—';
  return `${player.pos}${depth}`;
}

export function formatPosRankLabel(player: Player, scoring: ScoringFormat): string {
  const rank = player.posRank[scoring];
  if (rank == null) return '—';
  return `${player.pos}${rank}`;
}

export function getPosRankValue(player: Player, scoring: ScoringFormat): number | null {
  return player.posRank[scoring];
}
