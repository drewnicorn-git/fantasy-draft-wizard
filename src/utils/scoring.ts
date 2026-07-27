import type { Player, ScoringFormat } from './types';

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getConsensus(player: Player, scoring: ScoringFormat): number | null {
  return player.consensus[scoring];
}

export function getAdp(player: Player, scoring: ScoringFormat): number | null {
  return player.adp[scoring];
}

export function getSourceRank(player: Player, source: keyof Player['ranks']['std'], scoring: ScoringFormat): number | null {
  return player.ranks[scoring][source] ?? null;
}

export function matchesPosition(player: Player, filter: string): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'FLEX') return ['RB', 'WR', 'TE'].includes(player.pos);
  return player.pos === filter;
}

export const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
  'HOU', 'IND', 'JAC', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
];

export const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST'] as const;

export const SOURCE_LABELS: Record<string, string> = {
  fantasypros: 'FP',
  espn: 'ESPN',
  sleeper: 'Sleeper',
  yahoo: 'Yahoo',
  nfl: 'NFL',
};
