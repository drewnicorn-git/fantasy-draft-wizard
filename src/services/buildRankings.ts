import type { Player, RankingsData, SourceKey } from '../data/types';
import { fetchEspnRankings, fetchSleeperAdp, fetchSleeperPlayers } from './fetchSources';
import {
  buildDepthChartIndex,
  fetchEspnDepthCharts,
  resolvePlayerIdentity,
  type DepthIndexes,
} from '../utils/depthChart';
import { isValidPlayerName, normalizePos, type RawPlayerRow } from '../utils/playerKeys';

type PoolPlayer = Player;

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
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
    } else if (!p.teamVerified && identity.team) {
      p.team = identity.team;
    }
    if (identity.displayName.length > p.name.length) p.name = identity.displayName;
  }
  return p;
}

function importRows(
  pool: Map<string, PoolPlayer>,
  depthIndexes: DepthIndexes,
  rows: RawPlayerRow[],
  apply: (player: PoolPlayer, row: RawPlayerRow) => void,
): number {
  let count = 0;
  for (const row of rows) {
    const p = getOrCreatePlayer(pool, row.name, row.pos, row.team, depthIndexes);
    if (!p) continue;
    apply(p, row);
    if (row.bye != null) p.bye = row.bye;
    if (row.tier != null) p.tier = row.tier;
    count++;
  }
  return count;
}

function mergeExistingRanks(pool: Map<string, PoolPlayer>, existing: RankingsData | null): void {
  if (!existing) return;
  for (const old of existing.players) {
    const p = pool.get(old.id);
    if (!p) continue;
    p.ranks.std = { ...old.ranks.std, ...p.ranks.std };
    p.ranks.ppr = { ...old.ranks.ppr, ...p.ranks.ppr };
    if (old.tier != null && p.tier == null) p.tier = old.tier;
    if (old.posRank.std != null) p.posRank.std = old.posRank.std;
    if (old.posRank.ppr != null) p.posRank.ppr = old.posRank.ppr;
    if (old.rankStdDev != null) p.rankStdDev = old.rankStdDev;
  }
}

export type RefreshProgress = (message: string) => void;

export async function buildRankingsFromLiveSources(
  existing: RankingsData | null,
  onProgress?: RefreshProgress,
): Promise<RankingsData> {
  const season = existing?.season ?? currentDraftSeason();
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];

  onProgress?.('Fetching ESPN rosters…');
  let depthEntries = await fetchEspnDepthCharts(season).catch((e) => {
    errors.push(String(e));
    return [] as Awaited<ReturnType<typeof fetchEspnDepthCharts>>;
  });

  onProgress?.('Fetching Sleeper players…');
  const sleeperPlayers = await fetchSleeperPlayers().catch((e) => {
    errors.push(String(e));
    return [];
  });

  if (!depthEntries.length && sleeperPlayers.length) {
    depthEntries = sleeperPlayers.map((p) => ({ name: p.name, team: p.team, pos: normalizePos(p.pos) }));
  }

  const depthIndexes = buildDepthChartIndex(depthEntries);
  const pool = new Map<string, PoolPlayer>();
  const sourceCounts: Partial<Record<SourceKey, number>> = {};

  onProgress?.('Fetching ESPN rankings…');
  const espnRows = await fetchEspnRankings(season).catch((e) => {
    errors.push(String(e));
    return [] as RawPlayerRow[];
  });
  if (espnRows.length) {
    sourceCounts.espn = importRows(pool, depthIndexes, espnRows, (p, r) => {
      if (r.adp != null) p.adp.ppr = r.adp;
      if (r.rank != null) p.ranks.ppr.espn = r.rank;
    });
  }

  onProgress?.('Fetching Sleeper ADP…');
  const sleeperRows = await fetchSleeperAdp(season).catch((e) => {
    errors.push(String(e));
    return [] as RawPlayerRow[];
  });
  if (sleeperRows.length) {
    sourceCounts.sleeper = importRows(pool, depthIndexes, sleeperRows, (p, r) => {
      if (r.adpStd != null) p.adp.std = r.adpStd;
      if (r.adpPpr != null) p.adp.ppr = r.adpPpr;
      if (r.adp != null && p.adp.ppr == null) p.adp.ppr = r.adp;
      if (r.rank != null) p.ranks.ppr.sleeper = r.rank;
    });
  }

  mergeExistingRanks(pool, existing);

  for (const sp of sleeperPlayers) {
    const identity = resolvePlayerIdentity(sp.name, sp.pos, sp.team, depthIndexes);
    if (!identity) continue;
    const p = pool.get(identity.id);
    if (p && sp.injuryStatus) p.injuryStatus = sp.injuryStatus;
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

  const sourcesFromExisting = existing?.sources ?? [];
  const liveSources = (['espn', 'sleeper'] as SourceKey[]).filter((s) => sourceCounts[s]);
  const preserved = sourcesFromExisting.filter((s) => !liveSources.includes(s) && (s === 'fantasypros' || s === 'yahoo' || s === 'nfl'));
  const sources = [...new Set([...liveSources, ...preserved])];

  if (players.length < 100) {
    throw new Error(errors.length ? errors.join('; ') : 'Refresh returned too few players');
  }

  onProgress?.('Done');
  return {
    season,
    builtAt: fetchedAt,
    fetchedAt,
    sources,
    players,
  };
}

function currentDraftSeason(now = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  return month >= 2 ? year : year - 1;
}
