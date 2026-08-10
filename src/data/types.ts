export type ScoringFormat = 'std' | 'ppr';

/** League scoring rules mapped to available std/ppr ranking data. */
export interface LeagueScoringSettings {
  /** Points per reception: 0 = standard, 0.5 = half PPR, 1 = full PPR. */
  receptionPoints: number;
}

/** Starting lineup and bench slot counts for a league roster. */
export interface RosterPositionSettings {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  SUPERFLEX: number;
  K: number;
  DST: number;
  BENCH: number;
}

export const DEFAULT_SCORING_SETTINGS: LeagueScoringSettings = { receptionPoints: 1 };

export const DEFAULT_ROSTER_POSITIONS: RosterPositionSettings = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  SUPERFLEX: 0,
  K: 1,
  DST: 1,
  BENCH: 6,
};

export type RosterLimitKey = keyof RosterPositionSettings;
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
  scoringSettings?: LeagueScoringSettings;
  rosterPositions?: RosterPositionSettings;
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

export type MockDraftPhase = 'setup' | 'active' | 'summary';

export interface StoredMockDraft {
  picks: DraftPick[];
  draftedIds: string[];
  currentIndex: number;
  finished: boolean;
  history: DraftPick[][];
  phase: MockDraftPhase;
}

export type RankMetric = 'consensus' | 'manual' | 'adp' | SourceKey;

export interface RankDeltaCompare {
  from: RankMetric;
  to: RankMetric;
}

export type ManualRanksByScoring = Partial<Record<ScoringFormat, Record<string, number>>>;

/** Per-league persisted settings and draft state (Phase 2 multi-league). */
export interface LeagueProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  scoring: ScoringFormat;
  scoringSettings: LeagueScoringSettings;
  rosterPositions: RosterPositionSettings;
  draftConfig: DraftConfig;
  botPersonality: BotPersonality;
  selectedSources: SourceKey[];
  /** Non-preset tag definitions only; presets are merged at read time. */
  customTagDefinitions: TagDefinition[];
  playerTags: Record<string, string>;
  sheetState: SheetState;
  teamNames: string[];
  manualRanks: ManualRanksByScoring;
  /** Null uses UI defaults based on available ranking sources. */
  rankDeltaCompare: RankDeltaCompare | null;
  keepers: string[];
  keeperTeams: Record<string, number>;
  liveDraft: LiveDraftState | null;
  mockDraft: StoredMockDraft | null;
  inSeason: InSeasonState | null;
  /** Last selected NFL team on the Depth Charts tab. */
  depthChartTeam: string | null;
}

export interface LeaguesStore {
  version: number;
  activeLeagueId: string;
  leagues: Record<string, LeagueProfile>;
}

