import type { RawPlayerRow } from '../utils.js';

const ESPN_POSITION_MAP: Record<number, string> = {
  1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST',
};

const ESPN_TEAM_MAP: Record<number, string> = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
  9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA',
  16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI',
  23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR',
  30: 'JAC', 33: 'BAL', 34: 'HOU', 0: 'FA',
};

interface EspnPlayerPayload {
  fullName: string;
  defaultPositionId: number;
  proTeamId: number;
  ownership?: { averageDraftPosition?: number };
  draftRanksByRankType?: {
    PPR?: { rank?: number };
  };
}

function espnPprRank(player: EspnPlayerPayload): number | null {
  const rank = player.draftRanksByRankType?.PPR?.rank;
  return typeof rank === 'number' && rank > 0 ? rank : null;
}

/** ESPN Draft Kit PPR top-300 rankings (not ADP order). */
export async function fetchEspn(season: number): Promise<RawPlayerRow[]> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`;
  const filter = {
    players: {
      limit: 500,
      sortDraftRanks: { sortPriority: 1, sortAsc: true, value: 'PPR' },
      filterRanksForRankTypes: { value: ['PPR'] },
    },
  };
  const res = await fetch(url, {
    headers: {
      'X-Fantasy-Filter': JSON.stringify(filter),
      Accept: 'application/json',
      'User-Agent': 'fantasy-draft-wizard (github.com)',
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`ESPN: ${res.status}`);
  const json = (await res.json()) as {
    players: Array<{ player: EspnPlayerPayload }>;
  };
  if (!Array.isArray(json.players) || json.players.length < 150) {
    throw new Error(`ESPN: too few players (${json.players?.length ?? 0})`);
  }

  const rows = json.players
    .map(({ player: p }) => ({
      name: p.fullName,
      pos: ESPN_POSITION_MAP[p.defaultPositionId] ?? 'UNK',
      team: ESPN_TEAM_MAP[p.proTeamId] ?? 'FA',
      adp: p.ownership?.averageDraftPosition ?? null,
      rank: espnPprRank(p),
    }))
    .filter((row): row is RawPlayerRow & { rank: number } => row.rank != null)
    .sort((a, b) => a.rank - b.rank);

  if (rows.length < 150) {
    throw new Error(`ESPN: too few ranked players (${rows.length})`);
  }

  return rows;
}
