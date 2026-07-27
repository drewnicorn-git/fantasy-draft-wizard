import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentDraftSeason } from './season.js';
import { normalizeName, normalizePos, playerKey, type RawPlayerRow } from './utils.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'data', 'raw');
const outPath = join(root, 'data', 'rankings.json');
const publicPath = join(root, 'public', 'rankings.json');

const SEASON = currentDraftSeason();

export type SourceKey = 'fantasypros' | 'espn' | 'sleeper' | 'yahoo' | 'nfl';

export interface SourceRanks {
  fantasypros?: number;
  espn?: number;
  sleeper?: number;
  yahoo?: number;
  nfl?: number;
}

export interface PoolPlayer {
  id: string;
  name: string;
  team: string;
  pos: string;
  bye: number | null;
  tier: number | null;
  injuryStatus: string | null;
  ranks: { std: SourceRanks; ppr: SourceRanks };
  consensus: { std: number | null; ppr: number | null };
  adp: { std: number | null; ppr: number | null };
  posRank: { std: number | null; ppr: number | null };
  rankStdDev: number | null;
}

interface Snapshot {
  season?: number;
  fetchedAt?: string;
  data: { scoring?: string; players: RawPlayerRow[] };
}

function loadSnapshot(filename: string): Snapshot | null {
  const path = join(rawDir, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function merge(): void {
  const pool = new Map<string, PoolPlayer>();

  const ensure = (row: RawPlayerRow): PoolPlayer => {
    const pos = normalizePos(row.pos);
    const team = row.team.toUpperCase();
    const key = playerKey(row.name, team, pos);
    let p = pool.get(key);
    if (!p) {
      p = {
        id: key,
        name: row.name,
        team,
        pos,
        bye: row.bye ?? null,
        tier: row.tier ?? null,
        injuryStatus: null,
        ranks: { std: {}, ppr: {} },
        consensus: { std: null, ppr: null },
        adp: { std: null, ppr: null },
        posRank: { std: null, ppr: null },
        rankStdDev: null,
      };
      pool.set(key, p);
    }
    if (row.bye != null) p.bye = row.bye;
    if (row.tier != null) p.tier = row.tier;
    if (row.rankStd != null) p.rankStdDev = row.rankStd;
    return p;
  };

  const fpStd = loadSnapshot(`fp-STD-${SEASON}.json`);
  const fpPpr = loadSnapshot(`fp-PPR-${SEASON}.json`);
  const espn = loadSnapshot(`espn-${SEASON}.json`);
  const sleeper = loadSnapshot(`sleeper-adp-${SEASON}.json`);
  const yahooStd = loadSnapshot(`yahoo-STD-${SEASON}.json`);
  const yahooPpr = loadSnapshot(`yahoo-PPR-${SEASON}.json`);
  const nflStd = loadSnapshot(`nfl-STD-${SEASON}.json`);
  const sleeperPlayers = loadSnapshot('sleeper-players.json');

  for (const row of fpStd?.data.players ?? []) {
    const p = ensure(row);
    if (row.rank != null) p.ranks.std.fantasypros = row.rank;
    if (row.posRank != null) p.posRank.std = row.posRank;
  }
  for (const row of fpPpr?.data.players ?? []) {
    const p = ensure(row);
    if (row.rank != null) p.ranks.ppr.fantasypros = row.rank;
    if (row.posRank != null) p.posRank.ppr = row.posRank;
  }
  for (const row of espn?.data.players ?? []) {
    const p = ensure(row);
    if (row.adp != null) p.adp.ppr = row.adp;
    if (row.rank != null) p.ranks.ppr.espn = row.rank;
  }
  for (const row of sleeper?.data.players ?? []) {
    const p = ensure(row);
    const ext = row as RawPlayerRow & { adpStd?: number; adpPpr?: number };
    if (ext.adpStd != null) p.adp.std = ext.adpStd;
    if (ext.adpPpr != null) p.adp.ppr = ext.adpPpr;
    if (row.adp != null && p.adp.ppr == null) p.adp.ppr = row.adp;
    if (row.rank != null) p.ranks.ppr.sleeper = row.rank;
  }
  for (const row of yahooStd?.data.players ?? []) {
    const p = ensure(row);
    if (row.rank != null) p.ranks.std.yahoo = row.rank;
  }
  for (const row of yahooPpr?.data.players ?? []) {
    const p = ensure(row);
    if (row.rank != null) p.ranks.ppr.yahoo = row.rank;
  }
  for (const row of nflStd?.data.players ?? []) {
    const p = ensure(row);
    if (row.rank != null) p.ranks.std.nfl = row.rank;
  }

  if (sleeperPlayers?.data.players) {
    for (const sp of sleeperPlayers.data.players) {
      const key = playerKey(sp.name, sp.team, normalizePos(sp.pos));
      const p = pool.get(key);
      if (p && sp.injuryStatus) p.injuryStatus = sp.injuryStatus;
    }
  }

  const players = [...pool.values()].filter((p) => ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(p.pos));

  for (const p of players) {
    const stdRanks = Object.values(p.ranks.std).filter((n): n is number => n != null);
    const pprRanks = Object.values(p.ranks.ppr).filter((n): n is number => n != null);
    p.consensus.std = avg(stdRanks) != null ? Math.round(avg(stdRanks)!) : null;
    p.consensus.ppr = avg(pprRanks) != null ? Math.round(avg(pprRanks)!) : null;
    if (p.adp.std == null && p.consensus.std != null) p.adp.std = p.consensus.std;
    if (p.adp.ppr == null && p.consensus.ppr != null) p.adp.ppr = p.consensus.ppr;
  }

  players.sort((a, b) => (a.consensus.ppr ?? 9999) - (b.consensus.ppr ?? 9999));

  const fetchedAt = readdirSync(rawDir)
    .map((f) => loadSnapshot(f)?.fetchedAt)
    .filter(Boolean)
    .sort()
    .pop();

  const output = {
    season: SEASON,
    builtAt: new Date().toISOString(),
    fetchedAt: fetchedAt ?? null,
    sources: ['fantasypros', 'espn', 'sleeper', 'yahoo', 'nfl'].filter((s) => {
      if (s === 'yahoo') return yahooStd || yahooPpr;
      if (s === 'nfl') return !!nflStd;
      return true;
    }),
    players,
  };

  const json = JSON.stringify(output, null, 1) + '\n';
  writeFileSync(outPath, json);
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(publicPath, json);
  console.log(`Built ${players.length} players -> ${outPath}`);
}

merge();
