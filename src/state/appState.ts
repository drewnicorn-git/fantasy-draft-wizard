import type { AppState, DepthChartsData, InjuriesData, InSeasonData, LeagueScoringSettings, Player, RankingsData, RosterPositionSettings, ScoringFormat, SourceKey } from '../data/types';
import { isBlankPlayer } from '../utils/scoring';
import { normalizeName } from '../utils/playerKeys';
import { buildRankingsFromLiveSources, type RefreshProgress } from '../services/buildRankings';
import {
  loadKeepers,
  loadSelectedSources,
  saveSelectedSources,
  loadDraftConfig,
  saveDraftConfig,
  loadSheetState,
  saveSheetState,
  saveScoring,
  saveScoringSettings,
  saveBotPersonality,
  saveRosterPositions,
} from '../utils/storage';
import { getActiveLeague } from './leaguesStore';

let rankingsData: RankingsData | null = null;
let injuriesData: InjuriesData | null = null;
let inSeasonData: InSeasonData | null = null;
let depthChartsData: DepthChartsData | null = null;
let listeners: Array<() => void> = [];

export type SecondaryDataset = 'injuries' | 'inSeason' | 'depthCharts';
export type DataLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

const SECONDARY_LABELS: Record<SecondaryDataset, string> = {
  injuries: 'Injury report',
  inSeason: 'In-season values',
  depthCharts: 'Depth charts',
};

const secondaryStatus: Record<SecondaryDataset, DataLoadStatus> = {
  injuries: 'idle',
  inSeason: 'idle',
  depthCharts: 'idle',
};

let secondaryBannerDismissed = false;

async function fetchSecondaryJson<T>(file: string, dataset: SecondaryDataset): Promise<T | null> {
  secondaryStatus[dataset] = 'loading';
  const base = import.meta.env.BASE_URL;
  try {
    const res = await fetch(`${base}${file}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      secondaryStatus[dataset] = 'failed';
      notify();
      return null;
    }
    const data = (await res.json()) as T;
    secondaryStatus[dataset] = 'loaded';
    if (getSecondaryLoadFailures().length === 0) secondaryBannerDismissed = false;
    notify();
    return data;
  } catch {
    secondaryStatus[dataset] = 'failed';
    notify();
    return null;
  }
}

export function getSecondaryLoadFailures(): SecondaryDataset[] {
  return (Object.keys(secondaryStatus) as SecondaryDataset[]).filter((k) => secondaryStatus[k] === 'failed');
}

export function getSecondaryLoadFailureLabels(): string[] {
  return getSecondaryLoadFailures().map((k) => SECONDARY_LABELS[k]);
}

export function isSecondaryDataBannerVisible(): boolean {
  return getSecondaryLoadFailures().length > 0 && !secondaryBannerDismissed;
}

export function dismissSecondaryDataBanner(): void {
  secondaryBannerDismissed = true;
  notify();
}

export async function retrySecondaryData(): Promise<void> {
  secondaryBannerDismissed = false;
  injuriesData = null;
  inSeasonData = null;
  depthChartsData = null;
  await Promise.all([loadInjuries(), loadInSeason(), loadDepthCharts()]);
}

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
  if (partial.scoring) {
    state.draftConfig = { ...state.draftConfig, scoring: partial.scoring };
    saveScoring(partial.scoring);
  }
  if (partial.selectedSources) {
    saveSelectedSources([...partial.selectedSources]);
  }
  notify();
}

export function setScoring(scoring: ScoringFormat): void {
  setScoringSettings({ receptionPoints: scoring === 'std' ? 0 : 1 });
}

export function setScoringSettings(settings: LeagueScoringSettings): void {
  saveScoringSettings(settings);
  const league = getActiveLeague();
  state.scoring = league.scoring;
  state.draftConfig = {
    ...state.draftConfig,
    scoring: league.scoring,
    scoringSettings: league.scoringSettings,
    rosterPositions: league.rosterPositions,
  };
  notify();
}

export function setRosterPositions(positions: RosterPositionSettings): void {
  saveRosterPositions(positions);
  const league = getActiveLeague();
  state.draftConfig = {
    ...state.draftConfig,
    rosterPositions: league.rosterPositions,
    scoringSettings: league.scoringSettings,
  };
  notify();
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
  return fetchRankingsFromServer();
}

export async function reloadRankings(onProgress?: RefreshProgress): Promise<RankingsData> {
  onProgress?.('Loading latest rankings snapshot…');
  if (import.meta.env.PROD) {
    rankingsData = null;
    const data = await fetchRankingsFromServer(true);
    onProgress?.('Snapshot reloaded');
    notify();
    return data;
  }
  const snapshot = await fetchRankingsFromServer(true);
  onProgress?.('Fetching live ADP from ESPN, Sleeper, and Fantasy Calc…');
  const data = await buildRankingsFromLiveSources(snapshot, onProgress);
  rankingsData = data;
  notify();
  return data;
}

async function fetchRankingsFromServer(force = false): Promise<RankingsData> {
  if (!force && rankingsData) return rankingsData;
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}rankings.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load rankings (${res.status})`);
  rankingsData = (await res.json()) as RankingsData;
  applyPersistedSettings();
  return rankingsData;
}

function applyPersistedSettings(): void {
  if (!rankingsData) return;
  const league = getActiveLeague();
  state.scoring = league.scoring;
  state.botPersonality = league.botPersonality;

  const saved = loadSelectedSources();
  const available = new Set(rankingsData.sources);
  if (saved?.length) {
    state.selectedSources = new Set(saved.filter((s) => available.has(s as SourceKey)) as SourceKey[]);
  }
  if (state.selectedSources.size === 0) {
    state.selectedSources = new Set(rankingsData.sources);
  }

  const savedDraft = loadDraftConfig();
  state.draftConfig = {
    ...league.draftConfig,
    ...(savedDraft ?? {}),
    scoring: league.scoring,
    scoringSettings: league.scoringSettings,
    rosterPositions: league.rosterPositions,
    slot: savedDraft ? Math.min(savedDraft.slot, savedDraft.teams) : league.draftConfig.slot,
  };
}

/** Re-apply the active league profile into runtime state (e.g. after switching leagues). */
export function syncAppStateFromActiveLeague(): void {
  applyPersistedSettings();
  notify();
}

export function getSheetLocked(): boolean {
  return loadSheetState().locked;
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

export function updateDraftConfig(teams: number, slot: number, rounds: number): void {
  const clampedSlot = Math.max(1, Math.min(slot, teams));
  const league = getActiveLeague();
  state.draftConfig = {
    ...state.draftConfig,
    teams,
    slot: clampedSlot,
    rounds,
    scoring: league.scoring,
    scoringSettings: league.scoringSettings,
    rosterPositions: league.rosterPositions,
  };
  saveDraftConfig({ teams, slot: clampedSlot, rounds });
  notify();
}

export function applyDraftConfig(teams: number, slot: number, rounds: number, botPersonality?: typeof state.botPersonality): void {
  const clampedSlot = Math.max(1, Math.min(slot, teams));
  const league = getActiveLeague();
  state.draftConfig = {
    ...state.draftConfig,
    teams,
    slot: clampedSlot,
    rounds,
    scoring: league.scoring,
    scoringSettings: league.scoringSettings,
    rosterPositions: league.rosterPositions,
  };
  if (botPersonality) {
    state.botPersonality = botPersonality;
    saveBotPersonality(botPersonality);
  }
  saveDraftConfig({ teams, slot: clampedSlot, rounds });
}

export function getRankings(): RankingsData | null {
  return rankingsData;
}

export function getInjuries(): InjuriesData | null {
  return injuriesData;
}

export async function loadInjuries(): Promise<InjuriesData | null> {
  if (injuriesData) {
    secondaryStatus.injuries = 'loaded';
    return injuriesData;
  }
  const data = await fetchSecondaryJson<InjuriesData>('injuries.json', 'injuries');
  injuriesData = data;
  return injuriesData;
}

export function getInSeason(): InSeasonData | null {
  return inSeasonData;
}

export function getDepthCharts(): DepthChartsData | null {
  return depthChartsData;
}

export async function loadDepthCharts(): Promise<DepthChartsData | null> {
  if (depthChartsData) {
    secondaryStatus.depthCharts = 'loaded';
    return depthChartsData;
  }
  const data = await fetchSecondaryJson<DepthChartsData>('depth-charts.json', 'depthCharts');
  depthChartsData = data;
  return depthChartsData;
}

export async function loadInSeason(): Promise<InSeasonData | null> {
  if (inSeasonData) {
    secondaryStatus.inSeason = 'loaded';
    return inSeasonData;
  }
  const data = await fetchSecondaryJson<InSeasonData>('inseason.json', 'inSeason');
  inSeasonData = data;
  return inSeasonData;
}

export function getActiveSources(): SourceKey[] {
  const data = getRankings();
  const available = data?.sources ?? [];
  return available.filter((s) => state.selectedSources.has(s));
}

export function filterPlayers(
  players: Player[],
  draftedIds: Set<string> = new Set(),
  options: { includeKeepers?: boolean; uiFilters?: boolean } = {},
): Player[] {
  const { filters, scoring } = state;
  const uiFilters = options.uiFilters ?? true;
  const q = filters.search.trim().toLowerCase();
  const includeKeepers = options.includeKeepers ?? false;

  return players.filter((p) => {
    if (isBlankPlayer(p)) return false;
    if (draftedIds.has(p.id)) return false;
    if (!includeKeepers && loadKeepers().has(p.id)) return false;
    if (uiFilters && q) {
      const normalizedQuery = normalizeName(q);
      const nameMatch =
        normalizeName(p.name).includes(normalizedQuery) || p.name.toLowerCase().includes(q);
      if (!nameMatch) return false;
    }
    if (uiFilters && filters.teams.size && !filters.teams.has(p.team)) return false;
    if (uiFilters && filters.tierMax != null && p.tier != null && p.tier > filters.tierMax) return false;
    const adp = p.adp[scoring];
    if (uiFilters && adp != null && adp > filters.adpMax) return false;

    const posFilters = [...filters.positions];
    if (uiFilters && !posFilters.includes('ALL')) {
      const match = posFilters.some((f) => {
        if (f === 'FLEX') return ['RB', 'WR', 'TE'].includes(p.pos);
        return p.pos === f;
      });
      if (!match) return false;
    }
    return true;
  });
}
