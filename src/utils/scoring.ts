import type { Player, ScoringFormat, SourceKey, LeagueScoringSettings } from '../data/types';
import { getActiveLeague } from '../state/leaguesStore';
import { getLeagueAdp, getLeagueConsensus, getLeaguePosRank, getLeagueSourceRank } from './leagueRankings';
import { normalizeReceptionPoints } from './leagueSettings';
export { normalizeName } from './playerKeys';

function activeScoringSettings(): LeagueScoringSettings {
  return getActiveLeague().scoringSettings;
}

function activeSources(): SourceKey[] {
  const sources = getActiveLeague().selectedSources;
  return sources.length ? sources : ALL_SOURCES;
}

function usesBlendedScoring(settings: LeagueScoringSettings): boolean {
  const points = normalizeReceptionPoints(settings.receptionPoints);
  return points !== 0 && points !== 1;
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
  const league = getActiveLeague();
  const settings = league.scoringSettings;
  if (usesBlendedScoring(settings)) {
    return getLeagueConsensus(player, settings, activeSources());
  }
  const s = scoring ?? league.scoring;
  return computeConsensus(player, s, activeSources());
}

export function getAdp(player: Player, scoring?: ScoringFormat): number | null {
  const settings = activeScoringSettings();
  if (usesBlendedScoring(settings)) return getLeagueAdp(player, settings);
  return player.adp[scoring ?? getActiveLeague().scoring];
}

export function getSourceRank(
  player: Player,
  source: SourceKey,
  scoring?: ScoringFormat,
): number | null {
  const settings = activeScoringSettings();
  if (usesBlendedScoring(settings)) return getLeagueSourceRank(player, source, settings);
  return player.ranks[scoring ?? getActiveLeague().scoring][source] ?? null;
}

export function getPosRank(player: Player, scoring?: ScoringFormat): number | null {
  const settings = activeScoringSettings();
  if (usesBlendedScoring(settings)) return getLeaguePosRank(player, settings);
  return player.posRank[scoring ?? getActiveLeague().scoring];
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
  ffc: 'Fantasy Calc',
  yahoo: 'Yahoo',
  nfl: 'NFL.com',
};

export const ALL_SOURCES: SourceKey[] = ['fantasypros', 'espn', 'sleeper', 'ffc', 'yahoo', 'nfl'];
