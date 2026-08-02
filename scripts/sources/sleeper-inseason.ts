import { canonicalKey } from './espn-depth.js';
import { normalizePos } from '../utils.js';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const POS_QUERY = POSITIONS.map((p) => `position[]=${p}`).join('&');
const MAX_WEEKLY_PROJ = 50;

export interface SleeperInSeasonRaw {
  sleeperId: string;
  name: string;
  team: string;
  pos: string;
  injuryStatus: string | null;
  seasonPtsStd: number;
  seasonPtsPpr: number;
  prevWeekPtsStd: number | null;
  prevWeekPtsPpr: number | null;
  projPtsStd: number | null;
  projPtsPpr: number | null;
  projIsFallback: boolean;
  posRankStd: number | null;
  posRankPpr: number | null;
}

interface SleeperPlayerRecord {
  id: string;
  name: string;
  team: string;
  pos: string;
  injuryStatus: string | null;
}

function addStats(
  target: { pts_std?: number; pts_ppr?: number; pos_rank_std?: number; pos_rank_ppr?: number },
  source: Record<string, number | undefined>,
): void {
  if (source.pts_std != null) target.pts_std = (target.pts_std ?? 0) + source.pts_std;
  if (source.pts_ppr != null) target.pts_ppr = (target.pts_ppr ?? 0) + source.pts_ppr;
  if (source.pos_rank_std != null && source.pos_rank_std < 900) {
    target.pos_rank_std = source.pos_rank_std;
  }
  if (source.pos_rank_ppr != null && source.pos_rank_ppr < 900) {
    target.pos_rank_ppr = source.pos_rank_ppr;
  }
}

function isWeeklyProjectionRow(stats: Record<string, number | undefined>): boolean {
  const ptsPpr = stats.pts_ppr ?? 0;
  const ptsStd = stats.pts_std ?? 0;
  const pts = Math.max(ptsPpr, ptsStd);
  if (pts <= 0) return false;
  const gp = stats.gp ?? 0;
  if (gp >= 10 && pts > 60) return false;
  return pts < MAX_WEEKLY_PROJ;
}

async function fetchWeeklyStats(season: number, week: number): Promise<Record<string, Record<string, number | undefined>>> {
  const url = `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}?season_type=regular&${POS_QUERY}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Sleeper stats week ${week}: ${res.status}`);
  return (await res.json()) as Record<string, Record<string, number | undefined>>;
}

async function fetchWeeklyProjections(
  season: number,
  week: number,
): Promise<Map<string, { pts_std: number; pts_ppr: number }>> {
  const url = `https://api.sleeper.com/projections/nfl/${season}?season_type=regular&week=${week}&${POS_QUERY}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Sleeper projections week ${week}: ${res.status}`);

  const json = (await res.json()) as Array<{
    player_id?: string;
    stats?: Record<string, number | undefined>;
  }>;

  const map = new Map<string, { pts_std: number; pts_ppr: number }>();
  for (const row of json) {
    if (!row.player_id || !row.stats || !isWeeklyProjectionRow(row.stats)) continue;
    map.set(row.player_id, {
      pts_std: row.stats.pts_std ?? 0,
      pts_ppr: row.stats.pts_ppr ?? 0,
    });
  }
  return map;
}

export async function detectLatestStatsWeek(season: number): Promise<number> {
  for (let week = 18; week >= 1; week--) {
    try {
      const stats = await fetchWeeklyStats(season, week);
      const active = Object.values(stats).filter((s) => (s.gp ?? 0) > 0 || (s.pts_ppr ?? 0) > 0).length;
      if (active >= 20) return week;
    } catch {
      continue;
    }
  }
  return 1;
}

export function buildSleeperPlayerIndex(
  players: Array<{ id?: string; name: string; team: string; pos: string; injuryStatus?: string | null }>,
): Map<string, SleeperPlayerRecord> {
  const byKey = new Map<string, SleeperPlayerRecord>();
  for (const p of players) {
    if (!p.id) continue;
    const pos = normalizePos(p.pos);
    const key = canonicalKey(p.name, pos);
    byKey.set(key, {
      id: p.id,
      name: p.name,
      team: p.team,
      pos,
      injuryStatus: p.injuryStatus ?? null,
    });
  }
  return byKey;
}

export async function fetchSleeperInSeasonStats(
  season: number,
  sleeperPlayers: Array<{ id?: string; name: string; team: string; pos: string; injuryStatus?: string | null }>,
): Promise<{ currentWeek: number; projectionWeek: number; records: SleeperInSeasonRaw[] }> {
  const currentWeek = await detectLatestStatsWeek(season);
  const projectionWeek = Math.min(currentWeek + 1, 18);
  const sleeperIndex = buildSleeperPlayerIndex(sleeperPlayers);

  const seasonTotals = new Map<
    string,
    { pts_std?: number; pts_ppr?: number; pos_rank_std?: number; pos_rank_ppr?: number }
  >();
  const lastWeekTotals = new Map<string, { pts_std?: number; pts_ppr?: number }>();

  for (let week = 1; week <= currentWeek; week++) {
    const stats = await fetchWeeklyStats(season, week);
    for (const [sleeperId, row] of Object.entries(stats)) {
      if ((row.gp ?? 0) <= 0 && (row.pts_ppr ?? 0) <= 0) continue;
      const existing = seasonTotals.get(sleeperId) ?? {};
      addStats(existing, row);
      seasonTotals.set(sleeperId, existing);
      if (week === currentWeek) {
        lastWeekTotals.set(sleeperId, { pts_std: row.pts_std, pts_ppr: row.pts_ppr });
      }
    }
  }

  let nextWeekProjections = new Map<string, { pts_std: number; pts_ppr: number }>();
  try {
    nextWeekProjections = await fetchWeeklyProjections(season, projectionWeek);
  } catch (err) {
    console.warn(`  Sleeper week ${projectionWeek} projections unavailable:`, err);
  }

  const records: SleeperInSeasonRaw[] = [];
  for (const [, sleeper] of sleeperIndex) {
    const totals = seasonTotals.get(sleeper.id);
    const lastWeek = lastWeekTotals.get(sleeper.id);
    const projection = nextWeekProjections.get(sleeper.id);
    if (!totals && !lastWeek && !projection) continue;

    const seasonPtsStd = totals?.pts_std ?? 0;
    const seasonPtsPpr = totals?.pts_ppr ?? 0;
    const ppgStd = currentWeek > 0 ? seasonPtsStd / currentWeek : seasonPtsStd;
    const ppgPpr = currentWeek > 0 ? seasonPtsPpr / currentWeek : seasonPtsPpr;

    const hasProjection = !!projection && ((projection.pts_ppr ?? 0) > 0 || (projection.pts_std ?? 0) > 0);

    records.push({
      sleeperId: sleeper.id,
      name: sleeper.name,
      team: sleeper.team,
      pos: sleeper.pos,
      injuryStatus: sleeper.injuryStatus,
      seasonPtsStd,
      seasonPtsPpr,
      prevWeekPtsStd: lastWeek?.pts_std ?? null,
      prevWeekPtsPpr: lastWeek?.pts_ppr ?? null,
      projPtsStd: hasProjection ? projection!.pts_std : ppgStd,
      projPtsPpr: hasProjection ? projection!.pts_ppr : ppgPpr,
      projIsFallback: !hasProjection,
      posRankStd: totals?.pos_rank_std ?? null,
      posRankPpr: totals?.pos_rank_ppr ?? null,
    });
  }

  return { currentWeek, projectionWeek, records };
}
