import type { Player, ScoringFormat, SourceKey, CustomScoringRules } from '../data/types';
import { getActiveLeague } from '../state/leaguesStore';
import { getPlayerProjectedPoints } from './fantasyPoints';
import { scoringSettingsToLegacyFormat } from './leagueSettings';
export { normalizeName } from './playerKeys';

function activeScoringRules(): CustomScoringRules {
  return getActiveLeague().scoringSettings;
}

function activeSources(): SourceKey[] {
  const sources = getActiveLeague().selectedSources;
  return sources.length ? sources : ALL_SOURCES;
}

function legacyScoringFromRules(rules: CustomScoringRules): ScoringFormat {
  return scoringSettingsToLegacyFormat(rules);
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

export function getProjectedPoints(player: Player, rules?: CustomScoringRules): number | null {
  return getPlayerProjectedPoints(player, rules ?? activeScoringRules());
}

export function getConsensus(player: Player, scoring?: ScoringFormat): number | null {
  const league = getActiveLeague();
  const rules = league.scoringSettings;
  const s = scoring ?? legacyScoringFromRules(rules);
  return computeConsensus(player, s, activeSources());
}

export function getAdp(player: Player, scoring?: ScoringFormat): number | null {
  const rules = activeScoringRules();
  const s = scoring ?? legacyScoringFromRules(rules);
  return player.adp[s];
}

export function getSourceRank(
  player: Player,
  source: SourceKey,
  scoring?: ScoringFormat,
): number | null {
  const rules = activeScoringRules();
  const s = scoring ?? legacyScoringFromRules(rules);
  return player.ranks[s][source] ?? null;
}

export function getPosRank(player: Player, scoring?: ScoringFormat): number | null {
  const rules = activeScoringRules();
  const s = scoring ?? legacyScoringFromRules(rules);
  return player.posRank[s];
}

/** Value rank for draft tools: projected points descending rank, else ADP/consensus. */
export function getValueRank(player: Player, projectedRankMap?: Map<string, number>): number | null {
  const fromProj = projectedRankMap?.get(player.id);
  if (fromProj != null) return fromProj;
  const rules = activeScoringRules();
  const s = legacyScoringFromRules(rules);
  return getAdp(player, s) ?? getConsensus(player, s);
}

export function getAdpOrValue(player: Player, scoring?: ScoringFormat, projectedRankMap?: Map<string, number>): number | null {
  const valueRank = getValueRank(player, projectedRankMap);
  if (valueRank != null) return valueRank;
  const rules = activeScoringRules();
  const s = scoring ?? legacyScoringFromRules(rules);
  return player.adp[s] ?? getConsensus(player, s);
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
