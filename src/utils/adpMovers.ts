import type { Player, ScoringFormat } from '../data/types';
import { getActiveLeague } from '../state/leaguesStore';
import { getAdp, getConsensus } from './scoring';

const SNAPSHOT_PREFIX = 'fdw-adp-snapshot-';

export interface AdpSnapshot {
  builtAt: string;
  adps: Record<string, number>;
}

export interface AdpMover {
  player: Player;
  previous: number;
  current: number;
  delta: number;
}

function snapshotKey(leagueId: string): string {
  return `${SNAPSHOT_PREFIX}${leagueId}`;
}

function rankForPlayer(p: Player, scoring: ScoringFormat): number | null {
  return getAdp(p, scoring) ?? getConsensus(p, scoring);
}

export function loadAdpSnapshot(leagueId?: string): AdpSnapshot | null {
  const id = leagueId ?? getActiveLeague().id;
  try {
    const raw = localStorage.getItem(snapshotKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as AdpSnapshot;
  } catch {
    return null;
  }
}

export function saveAdpSnapshot(players: Player[], builtAt: string, scoring: ScoringFormat, leagueId?: string): void {
  const id = leagueId ?? getActiveLeague().id;
  const adps: Record<string, number> = {};
  for (const p of players) {
    const rank = rankForPlayer(p, scoring);
    if (rank != null) adps[p.id] = rank;
  }
  localStorage.setItem(snapshotKey(id), JSON.stringify({ builtAt, adps } satisfies AdpSnapshot));
}

export function computeAdpMovers(
  players: Player[],
  scoring: ScoringFormat,
  limit = 12,
): { risers: AdpMover[]; fallers: AdpMover[]; snapshotDate: string | null } {
  const snapshot = loadAdpSnapshot();
  if (!snapshot) return { risers: [], fallers: [], snapshotDate: null };

  const movers: AdpMover[] = [];
  for (const p of players) {
    const prev = snapshot.adps[p.id];
    const curr = rankForPlayer(p, scoring);
    if (prev == null || curr == null) continue;
    const delta = prev - curr;
    if (delta === 0) continue;
    movers.push({ player: p, previous: prev, current: curr, delta });
  }

  const risers = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, limit);
  const fallers = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit);
  return { risers, fallers, snapshotDate: snapshot.builtAt };
}
