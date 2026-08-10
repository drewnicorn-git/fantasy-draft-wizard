import type { DraftConfig, LeagueProfile, LeaguesStore, ScoringFormat } from '../data/types';
import {
  buildMigratedLeaguesStore,
  clearLegacyFlatStorage,
  hasLegacyFlatStorage,
} from '../utils/leagueStorage';

export const LEAGUES_STORE_KEY = 'fdw-leagues-store';
export const LEAGUES_STORE_VERSION = 1;

const DEFAULT_DRAFT_CONFIG: DraftConfig = {
  teams: 12,
  slot: 7,
  rounds: 15,
  scoring: 'ppr',
};

let cachedStore: LeaguesStore | null = null;

function newLeagueId(): string {
  return `league-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultLeagueProfile(name = 'My league'): LeagueProfile {
  const now = new Date().toISOString();
  const id = newLeagueId();
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    scoring: DEFAULT_DRAFT_CONFIG.scoring,
    draftConfig: { ...DEFAULT_DRAFT_CONFIG },
    botPersonality: 'balanced',
    selectedSources: [],
    customTagDefinitions: [],
    playerTags: {},
    sheetState: { locked: false, savedAt: null },
    teamNames: [],
    manualRanks: {},
    rankDeltaCompare: null,
    keepers: [],
    keeperTeams: {},
    liveDraft: null,
    mockDraft: null,
    inSeason: null,
    depthChartTeam: null,
  };
}

export function createDefaultLeaguesStore(): LeaguesStore {
  const league = createDefaultLeagueProfile();
  return {
    version: LEAGUES_STORE_VERSION,
    activeLeagueId: league.id,
    leagues: { [league.id]: league },
  };
}

function normalizeLeagueProfile(raw: Partial<LeagueProfile>, fallbackName: string): LeagueProfile {
  const base = createDefaultLeagueProfile(raw.name?.trim() || fallbackName);
  const scoring = raw.scoring === 'std' || raw.scoring === 'ppr' ? raw.scoring : base.scoring;
  const draftConfig = {
    ...base.draftConfig,
    ...(raw.draftConfig ?? {}),
    scoring,
  };
  draftConfig.slot = Math.max(1, Math.min(draftConfig.slot, draftConfig.teams));

  return {
    ...base,
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    name: raw.name?.trim() || base.name,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    scoring,
    draftConfig,
    botPersonality:
      raw.botPersonality === 'balanced' || raw.botPersonality === 'zero-rb' || raw.botPersonality === 'hero-rb'
        ? raw.botPersonality
        : base.botPersonality,
    selectedSources: Array.isArray(raw.selectedSources) ? [...raw.selectedSources] : base.selectedSources,
    customTagDefinitions: Array.isArray(raw.customTagDefinitions) ? [...raw.customTagDefinitions] : base.customTagDefinitions,
    playerTags: raw.playerTags && typeof raw.playerTags === 'object' ? { ...raw.playerTags } : base.playerTags,
    sheetState: raw.sheetState ? { ...base.sheetState, ...raw.sheetState } : base.sheetState,
    teamNames: Array.isArray(raw.teamNames) ? [...raw.teamNames] : base.teamNames,
    manualRanks: raw.manualRanks && typeof raw.manualRanks === 'object' ? { ...raw.manualRanks } : base.manualRanks,
    rankDeltaCompare: raw.rankDeltaCompare ?? base.rankDeltaCompare,
    keepers: Array.isArray(raw.keepers) ? [...raw.keepers] : base.keepers,
    keeperTeams: raw.keeperTeams && typeof raw.keeperTeams === 'object' ? { ...raw.keeperTeams } : base.keeperTeams,
    liveDraft: raw.liveDraft ?? base.liveDraft,
    mockDraft: raw.mockDraft ?? base.mockDraft,
    inSeason: raw.inSeason ?? base.inSeason,
    depthChartTeam: typeof raw.depthChartTeam === 'string' ? raw.depthChartTeam : base.depthChartTeam,
  };
}

function normalizeLeaguesStore(raw: Partial<LeaguesStore>): LeaguesStore | null {
  if (!raw?.leagues || typeof raw.activeLeagueId !== 'string') return null;
  const leagues: Record<string, LeagueProfile> = {};
  for (const [id, league] of Object.entries(raw.leagues)) {
    leagues[id] = normalizeLeagueProfile(league, 'Imported league');
  }
  const active = leagues[raw.activeLeagueId] ? raw.activeLeagueId : Object.keys(leagues)[0];
  if (!active) return null;
  return {
    version: LEAGUES_STORE_VERSION,
    activeLeagueId: active,
    leagues,
  };
}

export function loadLeaguesStore(): LeaguesStore {
  if (cachedStore) return cachedStore;

  try {
    const raw = localStorage.getItem(LEAGUES_STORE_KEY);
    if (!raw) {
      if (hasLegacyFlatStorage()) {
        cachedStore = buildMigratedLeaguesStore();
        saveLeaguesStore(cachedStore);
        clearLegacyFlatStorage();
        return cachedStore;
      }
      cachedStore = createDefaultLeaguesStore();
      saveLeaguesStore(cachedStore);
      return cachedStore;
    }
    const parsed = normalizeLeaguesStore(JSON.parse(raw) as Partial<LeaguesStore>);
    if (!parsed) {
      cachedStore = createDefaultLeaguesStore();
      saveLeaguesStore(cachedStore);
      return cachedStore;
    }
    cachedStore = parsed;
    return cachedStore;
  } catch {
    cachedStore = createDefaultLeaguesStore();
    saveLeaguesStore(cachedStore);
    return cachedStore;
  }
}

export function saveLeaguesStore(store: LeaguesStore): void {
  cachedStore = store;
  localStorage.setItem(LEAGUES_STORE_KEY, JSON.stringify(store));
}

export function resetLeaguesStoreCache(): void {
  cachedStore = null;
}

export function getActiveLeague(): LeagueProfile {
  const store = loadLeaguesStore();
  return store.leagues[store.activeLeagueId];
}

export function getLeague(id: string): LeagueProfile | undefined {
  return loadLeaguesStore().leagues[id];
}

export function listLeagues(): LeagueProfile[] {
  const store = loadLeaguesStore();
  return Object.values(store.leagues).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function setActiveLeague(id: string): LeagueProfile {
  const store = loadLeaguesStore();
  const league = store.leagues[id];
  if (!league) throw new Error(`Unknown league: ${id}`);
  store.activeLeagueId = id;
  saveLeaguesStore(store);
  return league;
}

function mergeLeaguePatch(current: LeagueProfile, patch: Partial<LeagueProfile>): LeagueProfile {
  const scoring: ScoringFormat = patch.scoring ?? current.scoring;
  const draftConfig: DraftConfig = {
    ...(patch.draftConfig ?? current.draftConfig),
    scoring,
  };

  return {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    scoring,
    draftConfig,
    updatedAt: new Date().toISOString(),
  };
}

export function updateLeague(id: string, patch: Partial<LeagueProfile>): LeagueProfile {
  const store = loadLeaguesStore();
  const current = store.leagues[id];
  if (!current) throw new Error(`Unknown league: ${id}`);
  const updated = mergeLeaguePatch(current, patch);
  store.leagues[id] = updated;
  saveLeaguesStore(store);
  return updated;
}

export function updateActiveLeague(patch: Partial<LeagueProfile>): LeagueProfile {
  const store = loadLeaguesStore();
  return updateLeague(store.activeLeagueId, patch);
}

export function addLeague(name: string): LeagueProfile {
  const store = loadLeaguesStore();
  const league = createDefaultLeagueProfile(name.trim() || 'New league');
  store.leagues[league.id] = league;
  store.activeLeagueId = league.id;
  saveLeaguesStore(store);
  return league;
}

export function renameLeague(id: string, name: string): LeagueProfile {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('League name cannot be empty');
  return updateLeague(id, { name: trimmed });
}

export function removeLeague(id: string): void {
  const store = loadLeaguesStore();
  if (Object.keys(store.leagues).length <= 1) {
    throw new Error('Cannot remove the last league');
  }
  if (!store.leagues[id]) return;
  delete store.leagues[id];
  if (store.activeLeagueId === id) {
    store.activeLeagueId = Object.keys(store.leagues)[0];
  }
  saveLeaguesStore(store);
}

function newImportLeagueId(): string {
  return newLeagueId();
}

export function importLeague(raw: Partial<LeagueProfile>, options: { activate?: boolean; name?: string } = {}): LeagueProfile {
  const store = loadLeaguesStore();
  const normalized = normalizeLeagueProfile(
    { ...raw, name: options.name?.trim() || raw.name },
    options.name?.trim() || 'Imported league',
  );
  const id = store.leagues[normalized.id] ? newImportLeagueId() : normalized.id;
  const now = new Date().toISOString();
  const league: LeagueProfile = {
    ...normalized,
    id,
    createdAt: now,
    updatedAt: now,
  };
  store.leagues[id] = league;
  if (options.activate !== false) store.activeLeagueId = id;
  saveLeaguesStore(store);
  return league;
}

export function replaceLeaguesStore(store: LeaguesStore): void {
  const normalized = normalizeLeaguesStore(store);
  if (!normalized) throw new Error('Invalid leagues store');
  saveLeaguesStore(normalized);
}
