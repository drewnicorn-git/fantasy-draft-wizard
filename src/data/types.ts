export type ScoringFormat = 'std' | 'ppr';

/** Full custom fantasy scoring rules for projected points. */
export interface CustomScoringRules {
  passYd: number;
  passTd: number;
  passInt: number;
  passTwoPt: number;
  rushYd: number;
  rushTd: number;
  rushTwoPt: number;
  reception: number;
  recYd: number;
  recTd: number;
  recTwoPt: number;
  fumLost: number;
  tePremium: number;
  fgMade: number;
  fgMiss: number;
  fg40_49: number;
  fg50Plus: number;
  xpMade: number;
  xpMiss: number;
  dstSack: number;
  dstInt: number;
  dstFumRec: number;
  dstTd: number;
  dstSafety: number;
  dstBlk: number;
}

/** @deprecated Use CustomScoringRules */
export type LeagueScoringSettings = CustomScoringRules;

export interface PlayerProjectionStats {
  passYd?: number | null;
  passTd?: number | null;
  passInt?: number | null;
  passTwoPt?: number | null;
  rushYd?: number | null;
  rushTd?: number | null;
  rushTwoPt?: number | null;
  rec?: number | null;
  recYd?: number | null;
  recTd?: number | null;
  recTwoPt?: number | null;
  fumLost?: number | null;
  fgm?: number | null;
  fgm40_49?: number | null;
  fgm50Plus?: number | null;
  fgmiss40_49?: number | null;
  fgmiss50Plus?: number | null;
  xpm?: number | null;
  xpmiss?: number | null;
  sacks?: number | null;
  interceptions?: number | null;
  fumRec?: number | null;
  defTd?: number | null;
  defKrTd?: number | null;
  defPrTd?: number | null;
  stTd?: number | null;
  blkKick?: number | null;
  safety?: number | null;
  ptsStd?: number | null;
  ptsPpr?: number | null;
  ptsHalfPpr?: number | null;
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
  /** Sleeper season projection stats used for custom scoring. */
  projections?: PlayerProjectionStats | null;
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
  scoringSettings?: CustomScoringRules;
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
  scoringSettings: CustomScoringRules;
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
  /** ISO timestamp — used for cross-device cloud sync conflict resolution. */
  updatedAt?: string;
}

