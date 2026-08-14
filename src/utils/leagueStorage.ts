import type {
  DraftConfig,
  InSeasonState,
  LeagueProfile,
  LeaguesStore,
  LiveDraftState,
  ManualRanksByScoring,
  RankDeltaCompare,
  ScoringFormat,
  SheetState,
  SourceKey,
  StoredMockDraft,
  TagDefinition,
} from '../data/types';
import { DEFAULT_ROSTER_POSITIONS } from '../data/types';
import { LEAGUES_STORE_VERSION } from '../state/leaguesStore';
import { scoringSettingsFromLegacyFormat } from '../utils/leagueSettings';

/** Flat localStorage keys used before Phase 2 multi-league storage. */
export const LEGACY_FLAT_KEYS = [
  'fdw-tag-definitions',
  'fdw-player-tags',
  'fdw-selected-sources',
  'fdw-draft-config',
  'fdw-sheet-state',
  'fdw-team-names',
  'fdw-live-draft',
  'fdw-keepers',
  'fdw-keeper-teams',
  'fdw-in-season',
  'fdw-manual-ranks',
  'fdw-rank-delta-compare',
  'fdw-depth-team',
] as const;

export const LEGACY_MANUAL_ORDER_KEY = 'fdw-manual-order';
export const LEGACY_MOCK_DRAFT_KEY = 'fdw-mock-draft';

const DEFAULT_DRAFT_CONFIG: DraftConfig = {
  teams: 12,
  slot: 7,
  rounds: 15,
  keepersPerTeam: 0,
  scoring: 'ppr',
};

function newLeagueId(): string {
  return `league-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readSessionJson<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function migrateLegacyManualOrder(): ManualRanksByScoring {
  const ranks = readJson<ManualRanksByScoring>('fdw-manual-ranks', {});
  if (Object.keys(ranks).length) return ranks;

  try {
    const legacy = readJson<Partial<Record<ScoringFormat, { order?: string[] }>>>(LEGACY_MANUAL_ORDER_KEY, {});
    const migrated: ManualRanksByScoring = {};
    for (const scoring of ['std', 'ppr'] as ScoringFormat[]) {
      const order = legacy[scoring]?.order;
      if (!order?.length) continue;
      const store: Record<string, number> = {};
      order.forEach((id, i) => {
        store[id] = i + 1;
      });
      migrated[scoring] = store;
    }
    return migrated;
  } catch {
    return {};
  }
}

function inferScoring(draftConfig: Partial<DraftConfig>, inSeason: InSeasonState | null): ScoringFormat {
  const fromInSeason = inSeason?.config?.scoring;
  if (fromInSeason === 'std' || fromInSeason === 'ppr') return fromInSeason;
  const fromDraft = draftConfig.scoring;
  if (fromDraft === 'std' || fromDraft === 'ppr') return fromDraft;
  return DEFAULT_DRAFT_CONFIG.scoring;
}

function readLegacyMockDraft(): StoredMockDraft | null {
  const parsed = readSessionJson<StoredMockDraft | null>(LEGACY_MOCK_DRAFT_KEY, null);
  if (!parsed || !Array.isArray(parsed.picks)) return null;
  return parsed;
}

export function hasLegacyFlatStorage(): boolean {
  if (LEGACY_FLAT_KEYS.some((key) => localStorage.getItem(key) != null)) return true;
  if (localStorage.getItem(LEGACY_MANUAL_ORDER_KEY) != null) return true;
  return sessionStorage.getItem(LEGACY_MOCK_DRAFT_KEY) != null;
}

export function buildLegacyLeagueProfile(name = 'My league'): LeagueProfile {
  const now = new Date().toISOString();
  const id = newLeagueId();

  const savedDraft = readJson<Partial<DraftConfig>>('fdw-draft-config', {});
  const inSeason = readJson<InSeasonState | null>('fdw-in-season', null);
  const scoring = inferScoring(savedDraft, inSeason);

  const draftConfig: DraftConfig = {
    teams: savedDraft.teams ?? DEFAULT_DRAFT_CONFIG.teams,
    slot: savedDraft.slot ?? DEFAULT_DRAFT_CONFIG.slot,
    rounds: savedDraft.rounds ?? DEFAULT_DRAFT_CONFIG.rounds,
    keepersPerTeam: savedDraft.keepersPerTeam ?? DEFAULT_DRAFT_CONFIG.keepersPerTeam,
    scoring,
  };
  draftConfig.slot = Math.max(1, Math.min(draftConfig.slot, draftConfig.teams));

  const sheetRaw = readJson<SheetState & { tierOverrides?: unknown }>('fdw-sheet-state', {
    locked: false,
    savedAt: null,
  });

  const selectedSources = readJson<string[]>('fdw-selected-sources', []).filter(Boolean) as SourceKey[];
  const customTagDefinitions = readJson<TagDefinition[]>('fdw-tag-definitions', []).filter((t) => !t.preset);
  const keepers = readJson<string[]>('fdw-keepers', []);
  const rankDeltaCompare = readJson<RankDeltaCompare | null>('fdw-rank-delta-compare', null);
  const depthTeamRaw = localStorage.getItem('fdw-depth-team');
  const scoringSettings = scoringSettingsFromLegacyFormat(scoring);

  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    scoring,
    scoringSettings,
    rosterPositions: { ...DEFAULT_ROSTER_POSITIONS },
    draftConfig: {
      teams: draftConfig.teams,
      slot: draftConfig.slot,
      rounds: draftConfig.rounds,
      scoring,
      scoringSettings,
      rosterPositions: { ...DEFAULT_ROSTER_POSITIONS },
    },
    botPersonality: 'balanced',
    selectedSources,
    customTagDefinitions,
    playerTags: readJson<Record<string, string>>('fdw-player-tags', {}),
    sheetState: { locked: !!sheetRaw.locked, savedAt: sheetRaw.savedAt ?? null },
    teamNames: readJson<string[]>('fdw-team-names', []),
    manualRanks: migrateLegacyManualOrder(),
    rankDeltaCompare,
    keepers: Array.isArray(keepers) ? keepers : [],
    keeperTeams: readJson<Record<string, number>>('fdw-keeper-teams', {}),
    liveDraft: readJson<LiveDraftState | null>('fdw-live-draft', null),
    mockDraft: readLegacyMockDraft(),
    inSeason,
    depthChartTeam: depthTeamRaw?.trim() || null,
  };
}

export function buildMigratedLeaguesStore(): LeaguesStore {
  const league = buildLegacyLeagueProfile();
  return {
    version: LEAGUES_STORE_VERSION,
    activeLeagueId: league.id,
    leagues: { [league.id]: league },
  };
}

export function clearLegacyFlatStorage(): void {
  for (const key of LEGACY_FLAT_KEYS) {
    localStorage.removeItem(key);
  }
  localStorage.removeItem(LEGACY_MANUAL_ORDER_KEY);
  sessionStorage.removeItem(LEGACY_MOCK_DRAFT_KEY);
}
