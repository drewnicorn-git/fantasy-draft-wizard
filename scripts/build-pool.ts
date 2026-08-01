import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentDraftSeason } from './season.js';
import { normalizePos, type RawPlayerRow } from './utils.js';
import {
  buildDepthChartIndex,
  canonicalKey,
  isValidPlayerName,
  resolvePlayerIdentity,
  type DepthChartEntry,
  type DepthIndexes,
} from './sources/espn-depth.js';

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
  teamVerified: boolean;
  depth: number | null;
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
  data: { scoring?: string; players: RawPlayerRow[] | DepthChartEntry[] };
}

function loadSnapshot(filename: string): Snapshot | null {
  if (!filename.endsWith('.json')) return null;
  const path = join(rawDir, filename);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw) as Snapshot;
  } catch {
    console.warn(`  Skipping invalid snapshot: ${filename}`);
    return null;
  }
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

interface SourceImport {
  source: SourceKey;
  scoring: 'std' | 'ppr';
  file: string;
  apply: (player: PoolPlayer, row: RawPlayerRow) => void;
}

function loadDepthIndex(): DepthIndexes {
  const snap = loadSnapshot(`espn-depth-${SEASON}.json`);
  const entries = (snap?.data.players ?? []) as DepthChartEntry[];
  if (entries.length) {
    console.log(`  ESPN depth/roster index: ${entries.length} entries`);
    return buildDepthChartIndex(entries);
  }

  const sleeper = loadSnapshot('sleeper-players.json');
  const sleeperEntries = (sleeper?.data.players ?? []) as Array<{ name: string; team: string; pos: string }>;
  if (sleeperEntries.length) {
    console.warn('  ESPN depth chart missing — falling back to Sleeper roster for team validation');
    return buildDepthChartIndex(
      sleeperEntries.map((p) => ({ name: p.name, team: p.team, pos: normalizePos(p.pos) })),
    );
  }

  console.warn('  No team validation index available');
  return { byKey: new Map(), byTeamPos: new Map() };
}

function mergeSourceRanks(target: SourceRanks, source: SourceRanks): SourceRanks {
  return { ...source, ...target };
}

function mergePoolPlayers(target: PoolPlayer, source: PoolPlayer): void {
  target.ranks.std = mergeSourceRanks(target.ranks.std, source.ranks.std);
  target.ranks.ppr = mergeSourceRanks(target.ranks.ppr, source.ranks.ppr);
  if (source.adp.std != null) target.adp.std = source.adp.std;
  if (source.adp.ppr != null) target.adp.ppr = source.adp.ppr;
  if (source.bye != null) target.bye = source.bye;
  if (source.tier != null) target.tier = source.tier;
  if (source.rankStdDev != null) target.rankStdDev = source.rankStdDev;
  if (source.posRank.std != null) target.posRank.std = source.posRank.std;
  if (source.posRank.ppr != null) target.posRank.ppr = source.posRank.ppr;
  if (source.teamVerified) {
    target.team = source.team;
    target.teamVerified = true;
  }
  if (source.depth != null && source.teamVerified) {
    target.depth =
      target.depth == null ? source.depth : Math.min(target.depth, source.depth);
  }
  if (source.name.length > target.name.length) target.name = source.name;
}

function getOrCreatePlayer(
  pool: Map<string, PoolPlayer>,
  name: string,
  pos: string,
  sourceTeam: string,
  depthIndexes: DepthIndexes,
): PoolPlayer | null {
  const identity = resolvePlayerIdentity(name, pos, sourceTeam, depthIndexes);
  if (!identity) return null;

  let p = pool.get(identity.id);
  if (!p) {
    p = {
      id: identity.id,
      name: identity.displayName,
      team: identity.team,
      pos: normalizePos(pos),
      teamVerified: identity.verified,
      depth: identity.depth,
      bye: null,
      tier: null,
      injuryStatus: null,
      ranks: { std: {}, ppr: {} },
      consensus: { std: null, ppr: null },
      adp: { std: null, ppr: null },
      posRank: { std: null, ppr: null },
      rankStdDev: null,
    };
    pool.set(identity.id, p);
  } else {
    if (identity.verified) {
      p.team = identity.team;
      p.teamVerified = true;
      if (identity.depth != null) {
        p.depth = p.depth == null ? identity.depth : Math.min(p.depth, identity.depth);
      }
    } else if (!p.teamVerified && identity.team) {
      p.team = identity.team;
    }
    if (identity.displayName.length > p.name.length) p.name = identity.displayName;
  }
  return p;
}

function importSourceFile(
  pool: Map<string, PoolPlayer>,
  depthIndexes: DepthIndexes,
  file: string,
  source: SourceKey,
  scoring: 'std' | 'ppr',
  apply: (player: PoolPlayer, row: RawPlayerRow) => void,
): number {
  const snap = loadSnapshot(file);
  if (!snap) return 0;
  let count = 0;
  for (const row of (snap.data.players ?? []) as RawPlayerRow[]) {
    const p = getOrCreatePlayer(pool, row.name, row.pos, row.team, depthIndexes);
    if (!p) continue;
    apply(p, row);
    if (row.bye != null) p.bye = row.bye;
    if (row.tier != null) p.tier = row.tier;
    if (row.rankStd != null) p.rankStdDev = row.rankStd;
    count++;
  }
  return count;
}

function merge(): void {
  const pool = new Map<string, PoolPlayer>();
  const depthIndexes = loadDepthIndex();

  const imports: SourceImport[] = [
    {
      source: 'fantasypros',
      scoring: 'std',
      file: `fp-STD-${SEASON}.json`,
      apply: (p, r) => {
        if (r.rank != null) p.ranks.std.fantasypros = r.rank;
        if (r.posRank != null) p.posRank.std = r.posRank;
      },
    },
    {
      source: 'fantasypros',
      scoring: 'ppr',
      file: `fp-PPR-${SEASON}.json`,
      apply: (p, r) => {
        if (r.rank != null) p.ranks.ppr.fantasypros = r.rank;
        if (r.posRank != null) p.posRank.ppr = r.posRank;
      },
    },
    {
      source: 'espn',
      scoring: 'ppr',
      file: `espn-${SEASON}.json`,
      apply: (p, r) => {
        if (r.adp != null) p.adp.ppr = r.adp;
        if (r.rank != null) p.ranks.ppr.espn = r.rank;
      },
    },
    {
      source: 'sleeper',
      scoring: 'ppr',
      file: `sleeper-adp-${SEASON}.json`,
      apply: (p, r) => {
        const ext = r as RawPlayerRow & { adpStd?: number; adpPpr?: number };
        if (ext.adpStd != null) p.adp.std = ext.adpStd;
        if (ext.adpPpr != null) p.adp.ppr = ext.adpPpr;
        if (r.adp != null && p.adp.ppr == null) p.adp.ppr = r.adp;
        if (r.rank != null) p.ranks.ppr.sleeper = r.rank;
      },
    },
    {
      source: 'yahoo',
      scoring: 'std',
      file: `yahoo-STD-${SEASON}.json`,
      apply: (p, r) => {
        if (r.rank != null) p.ranks.std.yahoo = r.rank;
      },
    },
    {
      source: 'yahoo',
      scoring: 'ppr',
      file: `yahoo-PPR-${SEASON}.json`,
      apply: (p, r) => {
        if (r.rank != null) p.ranks.ppr.yahoo = r.rank;
      },
    },
    {
      source: 'nfl',
      scoring: 'std',
      file: `nfl-STD-${SEASON}.json`,
      apply: (p, r) => {
        if (r.rank != null) p.ranks.std.nfl = r.rank;
      },
    },
  ];

  const sourceCounts: Record<string, number> = {};
  for (const imp of imports) {
    const n = importSourceFile(pool, depthIndexes, imp.file, imp.source, imp.scoring, imp.apply);
    if (n > 0) sourceCounts[imp.source] = (sourceCounts[imp.source] ?? 0) + n;
    console.log(`  ${imp.source} (${imp.scoring.toUpperCase()}): ${n} rows from ${imp.file}`);
  }

  // Injury data from Sleeper — match by resolved pool id
  const sleeperPlayers = loadSnapshot('sleeper-players.json');
  if (sleeperPlayers?.data.players) {
    for (const sp of sleeperPlayers.data.players as Array<{ name: string; team: string; pos: string; injuryStatus: string | null }>) {
      const identity = resolvePlayerIdentity(sp.name, sp.pos, sp.team, depthIndexes);
      if (!identity) continue;
      const p = pool.get(identity.id);
      if (p && sp.injuryStatus) p.injuryStatus = sp.injuryStatus;
    }
  }

  const players = [...pool.values()].filter((p) => {
    if (!isValidPlayerName(p.name)) return false;
    const rankCount =
      Object.keys(p.ranks.std).length + Object.keys(p.ranks.ppr).length + (p.adp.std != null ? 1 : 0) + (p.adp.ppr != null ? 1 : 0);
    return rankCount > 0;
  });

  for (const p of players) {
    const stdRanks = Object.values(p.ranks.std).filter((n): n is number => n != null);
    const pprRanks = Object.values(p.ranks.ppr).filter((n): n is number => n != null);
    p.consensus.std = avg(stdRanks) != null ? Math.round(avg(stdRanks)!) : null;
    p.consensus.ppr = avg(pprRanks) != null ? Math.round(avg(pprRanks)!) : null;
    if (p.adp.std == null && p.consensus.std != null) p.adp.std = p.consensus.std;
    if (p.adp.ppr == null && p.consensus.ppr != null) p.adp.ppr = p.consensus.ppr;
  }

  players.sort((a, b) => (a.consensus.ppr ?? 9999) - (b.consensus.ppr ?? 9999));

  const availableSources: SourceKey[] = ['fantasypros', 'espn', 'sleeper', 'yahoo', 'nfl'].filter((s) => sourceCounts[s]);

  const fetchedAt = readdirSync(rawDir)
    .map((f) => loadSnapshot(f)?.fetchedAt)
    .filter(Boolean)
    .sort()
    .pop();

  const output = {
    season: SEASON,
    builtAt: new Date().toISOString(),
    fetchedAt: fetchedAt ?? null,
    sources: availableSources,
    players,
  };

  const json = JSON.stringify(output, null, 1) + '\n';
  writeFileSync(outPath, json);
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(publicPath, json);
  console.log(`Built ${players.length} players (${players.filter((p) => p.teamVerified).length} team-verified) -> ${outPath}`);
}

merge();
