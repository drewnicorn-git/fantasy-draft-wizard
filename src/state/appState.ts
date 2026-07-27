import type { AppState, Player, RankingsData, ScoringFormat, SourceKey } from '../data/types';
import { isBlankPlayer } from '../utils/scoring';
import {
  loadSelectedSources,
  saveSelectedSources,
  loadDraftConfig,
  saveDraftConfig,
  loadSheetState,
  saveSheetState,
} from '../utils/storage';

let rankingsData: RankingsData | null = null;
let listeners: Array<() => void> = [];

export const defaultState: AppState = {
  scoring: 'ppr',
  tab: 'rankings',
  filters: {
    positions: new Set(['ALL']),
    teams: new Set(),
    tierMax: null,
    search: '',
    adpMax: 999,
  },
  selectedSources: new Set<SourceKey>(),
  draftConfig: { teams: 12, slot: 7, rounds: 15, scoring: 'ppr' },
  botPersonality: 'balanced',
};

export let state: AppState = {
  ...defaultState,
  filters: { ...defaultState.filters, positions: new Set(defaultState.filters.positions) },
  selectedSources: new Set(defaultState.selectedSources),
};

export function subscribe(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function notify(): void {
  listeners.forEach((l) => l());
}

export function setState(partial: Partial<AppState>): void {
  state = { ...state, ...partial };
  if (partial.scoring) state.draftConfig = { ...state.draftConfig, scoring: partial.scoring };
  if (partial.selectedSources) {
    saveSelectedSources([...partial.selectedSources]);
  }
  notify();
}

export function setScoring(scoring: ScoringFormat): void {
  setState({ scoring, draftConfig: { ...state.draftConfig, scoring } });
}

export function toggleSource(source: SourceKey): void {
  const next = new Set(state.selectedSources);
  if (next.has(source)) {
    if (next.size <= 1) return;
    next.delete(source);
  } else {
    next.add(source);
  }
  setState({ selectedSources: next });
}

export async function loadRankings(): Promise<RankingsData> {
  if (rankingsData) return rankingsData;
  return fetchRankings();
}

export async function reloadRankings(): Promise<RankingsData> {
  rankingsData = null;
  const data = await fetchRankings();
  notify();
  return data;
}

async function fetchRankings(): Promise<RankingsData> {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}rankings.json?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Failed to load rankings (${res.status})`);
  rankingsData = (await res.json()) as RankingsData;
  applyPersistedSettings();
  return rankingsData;
}

function applyPersistedSettings(): void {
  if (!rankingsData) return;
  const saved = loadSelectedSources();
  const available = new Set(rankingsData.sources);
  if (saved?.length) {
    state.selectedSources = new Set(saved.filter((s) => available.has(s as SourceKey)) as SourceKey[]);
  }
  if (state.selectedSources.size === 0) {
    state.selectedSources = new Set(rankingsData.sources);
  }

  const savedDraft = loadDraftConfig();
  if (savedDraft) {
    state.draftConfig = {
      ...state.draftConfig,
      teams: savedDraft.teams,
      slot: Math.min(savedDraft.slot, savedDraft.teams),
      rounds: savedDraft.rounds,
    };
  }
}

export function getSheetLocked(): boolean {
  return loadSheetState().locked;
}

export function getTierOverride(playerId: string): number | null {
  const { tierOverrides } = loadSheetState();
  return tierOverrides[playerId] ?? null;
}

export function setTierOverride(playerId: string, tier: number | null): void {
  const sheet = loadSheetState();
  if (tier == null) delete sheet.tierOverrides[playerId];
  else sheet.tierOverrides[playerId] = tier;
  saveSheetState(sheet);
}

export function lockSheet(): void {
  const sheet = loadSheetState();
  sheet.locked = true;
  sheet.savedAt = new Date().toISOString();
  saveSheetState(sheet);
}

export function unlockSheet(): void {
  const sheet = loadSheetState();
  sheet.locked = false;
  saveSheetState(sheet);
}

export function applyPlayerOverrides(players: Player[]): Player[] {
  const { tierOverrides } = loadSheetState();
  return players.map((p) => {
    const tier = tierOverrides[p.id];
    return tier != null ? { ...p, tier } : p;
  });
}

export function updateDraftConfig(teams: number, slot: number, rounds: number): void {
  const clampedSlot = Math.max(1, Math.min(slot, teams));
  state.draftConfig = { ...state.draftConfig, teams, slot: clampedSlot, rounds, scoring: state.scoring };
  saveDraftConfig({ teams, slot: clampedSlot, rounds });
  notify();
}

/** Update draft config without re-rendering the whole app (mock draft start). */
export function applyDraftConfig(teams: number, slot: number, rounds: number, botPersonality?: typeof state.botPersonality): void {
  const clampedSlot = Math.max(1, Math.min(slot, teams));
  state.draftConfig = { ...state.draftConfig, teams, slot: clampedSlot, rounds, scoring: state.scoring };
  if (botPersonality) state.botPersonality = botPersonality;
  saveDraftConfig({ teams, slot: clampedSlot, rounds });
}

export function getRankings(): RankingsData | null {
  if (!rankingsData) return null;
  return {
    ...rankingsData,
    players: applyPlayerOverrides(rankingsData.players),
  };
}

export function getActiveSources(): SourceKey[] {
  const data = getRankings();
  const available = data?.sources ?? [];
  return available.filter((s) => state.selectedSources.has(s));
}

export function filterPlayers(players: Player[], draftedIds: Set<string> = new Set()): Player[] {
  const { filters, scoring } = state;
  const q = filters.search.trim().toLowerCase();

  return players.filter((p) => {
    if (isBlankPlayer(p)) return false;
    if (draftedIds.has(p.id)) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (filters.teams.size && !filters.teams.has(p.team)) return false;
    if (filters.tierMax != null && p.tier != null && p.tier > filters.tierMax) return false;
    const adp = p.adp[scoring];
    if (adp != null && adp > filters.adpMax) return false;

    const posFilters = [...filters.positions];
    if (!posFilters.includes('ALL')) {
      const match = posFilters.some((f) => {
        if (f === 'FLEX') return ['RB', 'WR', 'TE'].includes(p.pos);
        return p.pos === f;
      });
      if (!match) return false;
    }
    return true;
  });
}
