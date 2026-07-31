import type { Player, ScoringFormat } from '../data/types';
import { getConsensus } from './scoring';

const MANUAL_RANKS_KEY = 'fdw-manual-ranks';
const LEGACY_MANUAL_ORDER_KEY = 'fdw-manual-order';

type ManualRanksStore = Record<string, number>;
type ManualRanksFile = Partial<Record<ScoringFormat, ManualRanksStore>>;

function readRanksFile(): ManualRanksFile {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_RANKS_KEY) ?? '{}') as ManualRanksFile;
  } catch {
    return {};
  }
}

function writeRanksFile(store: ManualRanksFile): void {
  localStorage.setItem(MANUAL_RANKS_KEY, JSON.stringify(store));
}

function migrateLegacyOrder(scoring: ScoringFormat): ManualRanksStore {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_MANUAL_ORDER_KEY) ?? '{}') as Partial<
      Record<ScoringFormat, { order?: string[] }>
    >;
    const order = legacy[scoring]?.order;
    if (!order?.length) return {};
    const ranks: ManualRanksStore = {};
    order.forEach((id, i) => {
      ranks[id] = i + 1;
    });
    return ranks;
  } catch {
    return {};
  }
}

export function loadManualRanks(scoring: ScoringFormat): ManualRanksStore {
  const file = readRanksFile();
  const existing = file[scoring];
  if (existing && Object.keys(existing).length) return { ...existing };

  const migrated = migrateLegacyOrder(scoring);
  if (Object.keys(migrated).length) {
    file[scoring] = migrated;
    writeRanksFile(file);
  }
  return migrated;
}

export function getManualRank(scoring: ScoringFormat, playerId: string): number | null {
  const rank = loadManualRanks(scoring)[playerId];
  return rank != null && rank > 0 ? rank : null;
}

export function setManualRank(scoring: ScoringFormat, playerId: string, rank: number | null): void {
  const file = readRanksFile();
  const ranks = { ...loadManualRanks(scoring) };
  if (rank == null || rank <= 0 || !Number.isFinite(rank)) {
    delete ranks[playerId];
  } else {
    ranks[playerId] = Math.round(rank);
  }
  file[scoring] = ranks;
  writeRanksFile(file);
}

export function clearManualRanks(scoring: ScoringFormat): void {
  const file = readRanksFile();
  delete file[scoring];
  writeRanksFile(file);
}

export function sortPlayersByManualRank(players: Player[], scoring: ScoringFormat): Player[] {
  return [...players].sort((a, b) => {
    const ra = getManualRank(scoring, a.id);
    const rb = getManualRank(scoring, b.id);
    if (ra == null && rb == null) {
      return (getConsensus(a, scoring) ?? 9999) - (getConsensus(b, scoring) ?? 9999);
    }
    if (ra == null) return 1;
    if (rb == null) return -1;
    if (ra !== rb) return ra - rb;
    return (getConsensus(a, scoring) ?? 9999) - (getConsensus(b, scoring) ?? 9999);
  });
}
