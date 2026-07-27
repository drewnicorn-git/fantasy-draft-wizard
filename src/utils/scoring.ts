import type { Player, ScoringFormat, SourceKey } from '../data/types';
import { state } from '../state/appState';

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

export function computeConsensus(
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
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function getConsensus(player: Player, scoring?: ScoringFormat): number | null {
  const s = scoring ?? state.scoring;
  return computeConsensus(player, s, state.selectedSources);
}

export function getAdp(player: Player, scoring: ScoringFormat): number | null {
  return player.adp[scoring];
}

export function getSourceRank(
  player: Player,
  source: SourceKey,
  scoring: ScoringFormat,
): number | null {
  return player.ranks[scoring][source] ?? null;
}

export function isBlankPlayer(player: Player): boolean {
  const name = player.name?.trim() ?? '';
  if (name.length < 2) return true;
  if (/^depth player\b/i.test(name)) return true;
  return false;
}

export const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
  'HOU', 'IND', 'JAC', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
];

export const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST'] as const;

export const SOURCE_LABELS: Record<SourceKey, string> = {
  fantasypros: 'FantasyPros',
  espn: 'ESPN',
  sleeper: 'Sleeper',
  yahoo: 'Yahoo',
  nfl: 'NFL.com',
};

export const ALL_SOURCES: SourceKey[] = ['fantasypros', 'espn', 'sleeper', 'yahoo', 'nfl'];
