export type ScoringFormat = 'std' | 'ppr';
export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST' | 'FLEX';

export type SourceKey = 'fantasypros' | 'espn' | 'sleeper' | 'yahoo' | 'nfl';

export interface SourceRanks {
  fantasypros?: number;
  espn?: number;
  sleeper?: number;
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
  tab: 'rankings' | 'mock' | 'live' | 'injuries' | 'inseason';
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
  weekProjStd: number | null;
  weekProjPpr: number | null;
  posRankStd: number | null;
  posRankPpr: number | null;
  injuryStatus: string | null;
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
  myTeamIndex: number;
}

export interface InSeasonTarget {
  category: 'waiver' | 'bye' | 'injury';
  player: Player;
  reason: string;
}

