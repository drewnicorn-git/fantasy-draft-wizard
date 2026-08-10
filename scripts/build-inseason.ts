import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentDraftSeason } from './season.js';
import { fetchSleeperInSeasonStats } from './sources/sleeper-inseason.js';
import {
  buildInSeasonMatchIndexes,
  matchPoolPlayerToSleeper,
  statsBySleeperId,
} from './sources/inseason-match.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rankingsPath = join(root, 'data', 'rankings.json');
const sleeperPlayersPath = join(root, 'data', 'raw', 'sleeper-players.json');
const outPath = join(root, 'data', 'inseason.json');
const publicPath = join(root, 'public', 'inseason.json');

const SEASON = currentDraftSeason();

interface PoolPlayer {
  id: string;
  name: string;
  team: string;
  pos: string;
}

interface InSeasonPlayerValue {
  playerId: string;
  seasonPtsStd: number | null;
  seasonPtsPpr: number | null;
  prevWeekPtsStd: number | null;
  prevWeekPtsPpr: number | null;
  projPtsStd: number | null;
  projPtsPpr: number | null;
  projIsFallback: boolean;
  posRankStd: number | null;
  posRankPpr: number | null;
  injuryStatus: string | null;
  hasStats: boolean;
}

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

async function build(): Promise<void> {
  if (!existsSync(rankingsPath)) {
    console.warn('  Rankings missing — skipping in-season build');
    return;
  }

  const rankings = JSON.parse(readFileSync(rankingsPath, 'utf8')) as { season: number; players: PoolPlayer[] };
  const season = rankings.season ?? SEASON;
  let sleeperPlayers: Array<{ id?: string; name: string; team: string; pos: string; injuryStatus?: string | null }> =
    [];
  if (existsSync(sleeperPlayersPath)) {
    const snap = JSON.parse(readFileSync(sleeperPlayersPath, 'utf8')) as {
      data?: { players?: Array<{ id?: string; name: string; team: string; pos: string; injuryStatus?: string | null }> };
    };
    sleeperPlayers = snap.data?.players ?? [];
  }

  console.log(`  Fetching Sleeper in-season stats for ${season}…`);
  let { currentWeek, projectionWeek, records } = await fetchSleeperInSeasonStats(season, sleeperPlayers);
  if (records.length === 0 && season > 2020) {
    console.warn(`  No ${season} stats yet — falling back to ${season - 1}`);
    const fallback = await fetchSleeperInSeasonStats(season - 1, sleeperPlayers);
    currentWeek = fallback.currentWeek;
    projectionWeek = fallback.projectionWeek;
    records = fallback.records;
  }

  const statsMap = statsBySleeperId(records);
  const matchIndexes = buildInSeasonMatchIndexes(sleeperPlayers);

  const players: Record<string, InSeasonPlayerValue> = {};
  let matched = 0;
  let withStats = 0;

  for (const p of rankings.players) {
    const sleeper = matchPoolPlayerToSleeper(p, matchIndexes);
    if (!sleeper) continue;

    matched++;
    const raw = statsMap.get(sleeper.id);
    const injuryStatus = raw?.injuryStatus ?? sleeper.injuryStatus ?? null;

    if (raw && hasAnyStats(raw)) {
      withStats++;
      players[p.id] = {
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
      players[p.id] = {
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

  const matchPct = rankings.players.length ? ((matched / rankings.players.length) * 100).toFixed(1) : '0';

  const output = {
    season,
    builtAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    currentWeek,
    projectionWeek,
    matchStats: { pool: rankings.players.length, matched, withStats, matchPct: Number(matchPct) },
    players,
  };

  const json = JSON.stringify(output, null, 1) + '\n';
  writeFileSync(outPath, json);
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(publicPath, json);
  console.log(
    `Built in-season values for ${Object.keys(players).length} players (${matchPct}% pool match, ${withStats} with stats; week ${currentWeek}, proj ${projectionWeek}) -> ${outPath}`,
  );
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
