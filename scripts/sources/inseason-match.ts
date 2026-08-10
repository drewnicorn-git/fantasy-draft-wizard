import { canonicalKey, dstTeamKey, normalizeTeam, VALID_TEAMS } from './espn-depth.js';
import { lastNameToken, normalizePos, playerKey, type RawPlayerRow } from '../utils.js';
import type { SleeperInSeasonRaw } from './sleeper-inseason.js';

export interface PoolMatchInput {
  id: string;
  name: string;
  team: string;
  pos: string;
}

export interface SleeperRosterEntry {
  id: string;
  name: string;
  team: string;
  pos: string;
  injuryStatus: string | null;
}

export interface InSeasonMatchIndexes {
  byKey: Map<string, SleeperRosterEntry>;
  byTeamPos: Map<string, SleeperRosterEntry[]>;
}

function addIndexKey(map: Map<string, SleeperRosterEntry>, key: string, entry: SleeperRosterEntry): void {
  if (!key || map.has(key)) return;
  map.set(key, entry);
}

export function buildInSeasonMatchIndexes(
  players: Array<{ id?: string; name: string; team: string; pos: string; injuryStatus?: string | null }>,
): InSeasonMatchIndexes {
  const byKey = new Map<string, SleeperRosterEntry>();
  const byTeamPos = new Map<string, SleeperRosterEntry[]>();

  for (const raw of players) {
    if (!raw.id) continue;
    const pos = normalizePos(raw.pos);
    const team = normalizeTeam(raw.team);
    const entry: SleeperRosterEntry = {
      id: raw.id,
      name: raw.name,
      team,
      pos,
      injuryStatus: raw.injuryStatus ?? null,
    };

    addIndexKey(byKey, raw.id, entry);
    addIndexKey(byKey, canonicalKey(raw.name, pos), entry);
    addIndexKey(byKey, playerKey(raw.name, team, pos), entry);
    if (pos === 'DST') {
      addIndexKey(byKey, dstTeamKey(team), entry);
      addIndexKey(byKey, `${team}|DST`, entry);
    }

    const teamPosKey = `${team}|${pos}`;
    const list = byTeamPos.get(teamPosKey) ?? [];
    list.push(entry);
    byTeamPos.set(teamPosKey, list);
  }

  return { byKey, byTeamPos };
}

export function matchPoolPlayerToSleeper(
  pool: PoolMatchInput,
  indexes: InSeasonMatchIndexes,
): SleeperRosterEntry | null {
  const pos = normalizePos(pool.pos);
  const team = normalizeTeam(pool.team);

  if (pos === 'DST') {
    return (
      indexes.byKey.get(pool.id) ??
      indexes.byKey.get(dstTeamKey(team)) ??
      indexes.byKey.get(`${team}|DST`) ??
      null
    );
  }

  const direct =
    indexes.byKey.get(pool.id) ??
    indexes.byKey.get(canonicalKey(pool.name, pos)) ??
    indexes.byKey.get(playerKey(pool.name, team, pos));
  if (direct) return direct;

  if (VALID_TEAMS.has(team)) {
    const last = lastNameToken(pool.name);
    const candidates = indexes.byTeamPos.get(`${team}|${pos}`) ?? [];
    const byLast = candidates.find((c) => lastNameToken(c.name) === last);
    if (byLast) return byLast;
  }

  return null;
}

export function statsBySleeperId(records: SleeperInSeasonRaw[]): Map<string, SleeperInSeasonRaw> {
  return new Map(records.map((r) => [r.sleeperId, r]));
}

export function poolPlayerFromRankings(p: RawPlayerRow & { id: string }): PoolMatchInput {
  return { id: p.id, name: p.name, team: p.team, pos: p.pos };
}
