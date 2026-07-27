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

export async function fetchEspn(season: number): Promise<RawPlayerRow[]> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`;
  const filter = { players: { limit: 400, sortAdp: { sortAsc: true, sortPriority: 1 } } };
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
    players: Array<{
      player: {
        fullName: string;
        defaultPositionId: number;
        proTeamId: number;
        ownership?: { averageDraftPosition?: number };
      };
    }>;
  };
  if (!Array.isArray(json.players) || json.players.length < 150) {
    throw new Error(`ESPN: too few players (${json.players?.length ?? 0})`);
  }
  return json.players.map(({ player: p }, idx) => ({
    name: p.fullName,
    pos: ESPN_POSITION_MAP[p.defaultPositionId] ?? 'UNK',
    team: ESPN_TEAM_MAP[p.proTeamId] ?? 'FA',
    adp: p.ownership?.averageDraftPosition ?? null,
    rank: idx + 1,
  }));
}
