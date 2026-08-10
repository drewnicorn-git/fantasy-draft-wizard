import type { DraftConfig, LeagueProfile, LeaguesStore, ScoringFormat } from '../data/types';

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

function normalizeLeaguesStore(raw: Partial<LeaguesStore>): LeaguesStore | null {
  if (!raw?.leagues || typeof raw.activeLeagueId !== 'string') return null;
  const active = raw.leagues[raw.activeLeagueId];
  if (!active) return null;
  return {
    version: LEAGUES_STORE_VERSION,
    activeLeagueId: raw.activeLeagueId,
    leagues: raw.leagues,
  };
}

export function loadLeaguesStore(): LeaguesStore {
  if (cachedStore) return cachedStore;

  try {
    const raw = localStorage.getItem(LEAGUES_STORE_KEY);
    if (!raw) {
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
