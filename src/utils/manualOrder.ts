import type { ManualRanksByScoring, Player, ScoringFormat } from '../data/types';
import { getActiveLeague, updateActiveLeague } from '../state/leaguesStore';
import { getConsensus } from './scoring';

type ManualRanksStore = Record<string, number>;

function readRanksFile(): ManualRanksByScoring {
  return { ...getActiveLeague().manualRanks };
}

function writeRanksFile(store: ManualRanksByScoring): void {
  updateActiveLeague({ manualRanks: store });
}

export function loadManualRanks(scoring: ScoringFormat): ManualRanksStore {
  const file = readRanksFile();
  const existing = file[scoring];
  return existing && Object.keys(existing).length ? { ...existing } : {};
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
