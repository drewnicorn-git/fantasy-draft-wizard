import type { AppState, Player, RankingsData, ScoringFormat } from './data/types';

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
  tags: {},
  draftConfig: { teams: 12, slot: 7, rounds: 15, scoring: 'ppr' },
  botPersonality: 'balanced',
};

export let state: AppState = { ...defaultState, filters: { ...defaultState.filters, positions: new Set(defaultState.filters.positions) } };

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
  notify();
}

export function setScoring(scoring: ScoringFormat): void {
  setState({ scoring, draftConfig: { ...state.draftConfig, scoring } });
}

export async function loadRankings(): Promise<RankingsData> {
  if (rankingsData) return rankingsData;
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}rankings.json`);
  if (!res.ok) throw new Error(`Failed to load rankings (${res.status})`);
  rankingsData = (await res.json()) as RankingsData;
  return rankingsData;
}

export function getRankings(): RankingsData | null {
  return rankingsData;
}

export function filterPlayers(players: Player[], draftedIds: Set<string> = new Set()): Player[] {
  const { filters, scoring, tags } = state;
  const q = filters.search.trim().toLowerCase();

  return players.filter((p) => {
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