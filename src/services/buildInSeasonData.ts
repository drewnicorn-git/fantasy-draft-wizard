import type { InSeasonData, InSeasonPlayerValue, Player } from '../data/types';
import { fetchSleeperPlayers } from './fetchSources';
import { fetchSleeperInSeasonStats } from './sleeperInSeason';
import {
  buildInSeasonMatchIndexes,
  matchPoolPlayerToSleeper,
  statsBySleeperId,
} from '../utils/inseasonMatch';

export type InSeasonProgress = (message: string) => void;

function hasAnyStats(raw: {
  seasonPtsStd: number;
  seasonPtsPpr: number;
  prevWeekPtsStd: number | null;
  prevWeekPtsPpr: number | null;
  projPtsStd: number | null;
  projPtsPpr: number | null;
}): boolean {
  return (
    raw.seasonPtsStd > 0 ||
    raw.seasonPtsPpr > 0 ||
    (raw.prevWeekPtsStd ?? 0) > 0 ||
    (raw.prevWeekPtsPpr ?? 0) > 0 ||
    (raw.projPtsStd ?? 0) > 0 ||
    (raw.projPtsPpr ?? 0) > 0
  );
}

export async function buildInSeasonFromLiveSources(
  players: Player[],
  season: number,
  onProgress?: InSeasonProgress,
): Promise<InSeasonData> {
  onProgress?.('Fetching Sleeper players…');
  const sleeperPlayers = await fetchSleeperPlayers();

  onProgress?.('Fetching live stats and projections…');
  let { currentWeek, projectionWeek, records } = await fetchSleeperInSeasonStats(season, sleeperPlayers);
  if (records.length === 0 && season > 2020) {
    onProgress?.(`No ${season} stats yet — trying ${season - 1}…`);
    const fallback = await fetchSleeperInSeasonStats(season - 1, sleeperPlayers);
    currentWeek = fallback.currentWeek;
    projectionWeek = fallback.projectionWeek;
    records = fallback.records;
  }

  const statsMap = statsBySleeperId(records);
  const matchIndexes = buildInSeasonMatchIndexes(sleeperPlayers);
  const playerValues: Record<string, InSeasonPlayerValue> = {};
  let matched = 0;
  let withStats = 0;

  for (const p of players) {
    const sleeper = matchPoolPlayerToSleeper(p, matchIndexes);
    if (!sleeper) continue;

    matched++;
    const raw = statsMap.get(sleeper.id);
    const injuryStatus = raw?.injuryStatus ?? sleeper.injuryStatus ?? null;

    if (raw && hasAnyStats(raw)) {
      withStats++;
      playerValues[p.id] = {
        playerId: p.id,
        seasonPtsStd: raw.seasonPtsStd,
        seasonPtsPpr: raw.seasonPtsPpr,
        prevWeekPtsStd: raw.prevWeekPtsStd,
        prevWeekPtsPpr: raw.prevWeekPtsPpr,
        projPtsStd: raw.projPtsStd,
        projPtsPpr: raw.projPtsPpr,
        projIsFallback: raw.projIsFallback,
        posRankStd: raw.posRankStd,
        posRankPpr: raw.posRankPpr,
        injuryStatus,
        hasStats: true,
      };
    } else {
      playerValues[p.id] = {
        playerId: p.id,
        seasonPtsStd: null,
        seasonPtsPpr: null,
        prevWeekPtsStd: null,
        prevWeekPtsPpr: null,
        projPtsStd: null,
        projPtsPpr: null,
        projIsFallback: false,
        posRankStd: null,
        posRankPpr: null,
        injuryStatus,
        hasStats: false,
      };
    }
  }

  const matchPct = players.length ? Number(((matched / players.length) * 100).toFixed(1)) : 0;
  const fetchedAt = new Date().toISOString();

  onProgress?.('Done');
  return {
    season,
    builtAt: fetchedAt,
    fetchedAt,
    currentWeek,
    projectionWeek,
    matchStats: { pool: players.length, matched, withStats, matchPct },
    players: playerValues,
  };
}
