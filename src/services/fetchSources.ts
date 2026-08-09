import type { RawPlayerRow } from '../utils/playerKeys';
import { normalizePos } from '../utils/playerKeys';

const FFC_SCORING_PATH = {
  std: 'standard',
  ppr: 'ppr',
} as const;

function mapFfcPosition(pos: string): string {
  const p = pos.toUpperCase();
  if (p === 'PK') return 'K';
  return normalizePos(p);
}

export async function fetchFfcAdp(
  season: number,
  scoring: keyof typeof FFC_SCORING_PATH,
  teams = 12,
): Promise<RawPlayerRow[]> {
  const format = FFC_SCORING_PATH[scoring];
  const url = `https://fantasyfootballcalculator.com/api/v1/adp/${format}?position=all&teams=${teams}&year=${season}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'fantasy-draft-wizard (github.com)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Fantasy Calc ADP: ${res.status}`);

  const json = (await res.json()) as {
    status?: string;
    players?: Array<{
      name: string;
      team: string;
      position: string;
      adp: number;
      bye?: number | null;
    }>;
  };

  const players = json.players ?? [];
  if (json.status !== 'Success' || players.length < 100) {
    throw new Error(`Fantasy Calc ADP: too few players (${players.length})`);
  }

  const sorted = [...players].sort((a, b) => a.adp - b.adp);
  return sorted.map((p, idx) => ({
    name: p.name.trim(),
    team: (p.team || 'FA').toUpperCase(),
    pos: mapFfcPosition(p.position),
    adp: p.adp,
    rank: idx + 1,
    bye: p.bye ?? null,
  }));
}

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

export async function fetchEspnRankings(season: number): Promise<RawPlayerRow[]> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`;
  const filter = { players: { limit: 400, sortAdp: { sortAsc: true, sortPriority: 1 } } };
  const res = await fetch(url, {
    headers: {
      'X-Fantasy-Filter': JSON.stringify(filter),
      Accept: 'application/json',
      'User-Agent': 'fantasy-draft-wizard (github.com)',
    },
  });
  if (!res.ok) throw new Error(`ESPN fantasy API: ${res.status}`);
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
    throw new Error(`ESPN fantasy API: too few players (${json.players?.length ?? 0})`);
  }
  return json.players.map(({ player: p }, idx) => ({
    name: p.fullName,
    pos: ESPN_POSITION_MAP[p.defaultPositionId] ?? 'UNK',
    team: ESPN_TEAM_MAP[p.proTeamId] ?? 'FA',
    adp: p.ownership?.averageDraftPosition ?? null,
    rank: idx + 1,
  }));
}

export async function fetchSleeperAdp(season: number): Promise<RawPlayerRow[]> {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => `position[]=${p}`).join('&');
  const url = `https://api.sleeper.com/projections/nfl/${season}?season_type=regular&${positions}&order_by=adp_ppr`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
  });
  if (!res.ok) throw new Error(`Sleeper ADP: ${res.status}`);
  const json = (await res.json()) as Array<{
    team: string | null;
    player: { first_name: string; last_name: string; position: string };
    stats: Record<string, number | undefined>;
  }>;
  if (!Array.isArray(json) || json.length < 100) {
    throw new Error(`Sleeper ADP: too few rows (${json.length ?? 0})`);
  }
  const ranked = json.filter(
    (p) => (p.stats?.adp_ppr ?? 999) < 999 || (p.stats?.adp_std ?? 999) < 999 || (p.stats?.pts_ppr ?? 0) > 0,
  );
  return ranked.map((p, idx) => ({
    name: `${p.player.first_name} ${p.player.last_name}`,
    pos: p.player.position === 'DEF' ? 'DST' : p.player.position,
    team: p.team ?? 'FA',
    adp: (p.stats.adp_ppr ?? 999) < 999 ? p.stats.adp_ppr! : null,
    rank: idx + 1,
    adpStd: (p.stats.adp_std ?? 999) < 999 ? p.stats.adp_std! : null,
    adpPpr: (p.stats.adp_ppr ?? 999) < 999 ? p.stats.adp_ppr! : null,
  }));
}

export async function fetchSleeperPlayers(): Promise<
  Array<{ name: string; team: string; pos: string; injuryStatus: string | null }>
> {
  const res = await fetch('https://api.sleeper.app/v1/players/nfl', {
    headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
  });
  if (!res.ok) throw new Error(`Sleeper players: ${res.status}`);
  const json = (await res.json()) as Record<
    string,
    {
      first_name?: string;
      last_name?: string;
      position?: string | null;
      team?: string | null;
      injury_status?: string | null;
      full_name?: string;
    }
  >;
  const positions = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
  return Object.values(json)
    .filter((p) => p.position && positions.has(p.position) && p.team)
    .map((p) => ({
      name: p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      pos: p.position === 'DEF' ? 'DST' : p.position!,
      team: p.team!,
      injuryStatus: p.injury_status ?? null,
    }));
}
