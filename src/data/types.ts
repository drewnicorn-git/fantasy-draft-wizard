export type ScoringFormat = 'std' | 'ppr';
export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST' | 'FLEX';

export type SourceKey = 'fantasypros' | 'espn' | 'sleeper' | 'ffc' | 'yahoo' | 'nfl';

export interface SourceRanks {
  fantasypros?: number;
  espn?: number;
  sleeper?: number;
  ffc?: number;
  yahoo?: number;
  nfl?: number;
}

export interface TagDefinition {
  id: string;
  label: string;
  color: string;
  description?: string;
  preset?: boolean;
}

export interface Player {
  id: string;
  name: string;
  team: string;
  pos: Position | string;
  teamVerified?: boolean;
  depth?: number | null;
  bye: number | null;
  tier: number | null;
  injuryStatus: string | null;
  ranks: { std: SourceRanks; ppr: SourceRanks };
  consensus: { std: number | null; ppr: number | null };
  adp: { std: number | null; ppr: number | null };
  posRank: { std: number | null; ppr: number | null };
  rankStdDev: number | null;
}

export interface RankingsData {
  season: number;
  builtAt: string;
  fetchedAt: string | null;
  sources: SourceKey[];
  players: Player[];
}

export interface InjuryReportEntry {
  playerId: string;
  name: string;
  team: string;
  pos: string;
  status: string;
  summary: string;
  updatedAt: string;
}

export interface InjuriesData {
  season: number;
  builtAt: string;
  fetchedAt: string | null;
  entries: InjuryReportEntry[];
}

export interface DepthChartsData {
  season: number;
  builtAt: string;
  fetchedAt: string | null;
  teams: Record<string, Partial<Record<'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST', string[]>>>;
}

export interface FilterState {
  positions: Set<string>;
  teams: Set<string>;
  tierMax: number | null;
  search: string;
  adpMax: number;
}

export interface DraftConfig {
  teams: number;
  slot: number;
  rounds: number;
  scoring: ScoringFormat;
}

export interface DraftPick {
  round: number;
  pickInRound: number;
  overall: number;
  teamIndex: number;
  playerId: string;
  playerName: string;
  pos: string;
}

export interface RosterSlot {
  label: string;
  posFilter: string[];
  playerId: string | null;
}

export type BotPersonality = 'balanced' | 'zero-rb' | 'hero-rb';

export interface AppState {
  scoring: ScoringFormat;
  tab: 'rankings' | 'mock' | 'live' | 'injuries' | 'inseason' | 'depth';
  filters: FilterState;
  selectedSources: Set<SourceKey>;
  draftConfig: DraftConfig;
  botPersonality: BotPersonality;
}

export interface SheetState {
  locked: boolean;
  tierOverrides: Record<string, number>;
  savedAt: string | null;
}

export interface LiveDraftState {
  active: boolean;
  picks: DraftPick[];
  currentIndex: number;
}

export interface InSeasonPlayerValue {
  playerId: string;
  seasonPtsStd: number | null;
  seasonPtsPpr: number | null;
  prevWeekPtsStd: number | null;
  prevWeekPtsPpr: number | null;
  projPtsStd: number | null;
  projPtsPpr: number | null;
  projIsFallback: boolean;
  posRankStd: number | null;
  posRankPpr: number | null;
  injuryStatus: string | null;
  /** @deprecated Legacy field from older builds */
  weekProjStd?: number | null;
  /** @deprecated Legacy field from older builds */
  weekProjPpr?: number | null;
}

export interface InSeasonData {
  season: number;
  builtAt: string;
  fetchedAt: string | null;
  currentWeek: number;
  projectionWeek: number;
  players: Record<string, InSeasonPlayerValue>;
}

export interface InSeasonState {
  active: boolean;
  importedAt: string;
  config: DraftConfig;
  teamNames: string[];
  rosters: Record<number, string[]>;
  rosterLimits: Record<number, number>;
  myTeamIndex: number;
}

export interface InSeasonTarget {
  category: 'waiver' | 'bye' | 'injury';
  player: Player;
  reason: string;
}

