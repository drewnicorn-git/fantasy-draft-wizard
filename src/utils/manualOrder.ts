import type { Player, ScoringFormat } from '../data/types';
import { getConsensus } from './scoring';

const MANUAL_ORDER_KEY = 'fdw-manual-order';

export interface ManualOrderStore {
  order: string[];
  savedAt: string | null;
}

type ManualOrderFile = Partial<Record<ScoringFormat, ManualOrderStore>>;

function readStore(): ManualOrderFile {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_ORDER_KEY) ?? '{}') as ManualOrderFile;
  } catch {
    return {};
  }
}

function writeStore(store: ManualOrderFile): void {
  localStorage.setItem(MANUAL_ORDER_KEY, JSON.stringify(store));
}

export function loadManualOrderStore(scoring: ScoringFormat): ManualOrderStore {
  const entry = readStore()[scoring];
  if (!entry?.order?.length) return { order: [], savedAt: null };
  return { order: [...entry.order], savedAt: entry.savedAt ?? null };
}

export function saveManualOrderStore(scoring: ScoringFormat, order: string[]): ManualOrderStore {
  const saved: ManualOrderStore = { order: [...order], savedAt: new Date().toISOString() };
  const store = readStore();
  store[scoring] = saved;
  writeStore(store);
  return saved;
}

export function buildConsensusOrder(players: Player[], scoring: ScoringFormat): string[] {
  return [...players]
    .sort((a, b) => (getConsensus(a, scoring) ?? 9999) - (getConsensus(b, scoring) ?? 9999))
    .map((p) => p.id);
}

export function mergeManualOrder(saved: string[], players: Player[], scoring: ScoringFormat): string[] {
  const ids = new Set(players.map((p) => p.id));
  const order = saved.filter((id) => ids.has(id));
  const seen = new Set(order);
  for (const id of buildConsensusOrder(players, scoring)) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}

export function orderPlayersByManualList(players: Player[], fullOrder: string[]): Player[] {
  const rank = new Map(fullOrder.map((id, i) => [id, i]));
  return [...players].sort((a, b) => (rank.get(a.id) ?? 99999) - (rank.get(b.id) ?? 99999));
}

export function buildSheetRanks(players: Player[], scoring: ScoringFormat): Map<string, number> {
  const ranks = new Map<string, number>();
  buildConsensusOrder(players, scoring).forEach((id, i) => ranks.set(id, i + 1));
  return ranks;
}

export function reorderManualIds(order: string[], dragId: string, targetId: string): string[] {
  if (dragId === targetId) return order;
  const next = order.filter((id) => id !== dragId);
  const targetIdx = next.indexOf(targetId);
  if (targetIdx < 0) return order;
  next.splice(targetIdx, 0, dragId);
  return next;
}
