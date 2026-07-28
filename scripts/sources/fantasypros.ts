import type { RawPlayerRow, ScoringKey } from './utils.js';

function fantasyProsApiKey(): string {
  const fromEnv = process.env.FANTASYPROS_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  // Fallback for local dev; CI should set FANTASYPROS_API_KEY repo secret when available.
  return 'zjxN52G3lP4fORpHRftGI2mTU8cTwxVNvkjByM3j';
}

export async function fetchFantasyPros(season: number, scoring: ScoringKey): Promise<RawPlayerRow[]> {
  const url = `https://api.fantasypros.com/v2/json/nfl/${season}/consensus-rankings?type=draft&scoring=${scoring}&position=ALL&week=0`;
  const res = await fetch(url, {
    headers: {
      'x-api-key': fantasyProsApiKey(),
      'User-Agent': 'fantasy-draft-wizard (github.com)',
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`FantasyPros ${scoring}: ${res.status}`);
  const json = (await res.json()) as {
    players: Array<{
      player_name: string;
      player_team_id: string;
      player_position_id: string;
      pos_rank?: string | null;
      rank_ecr: number;
      tier: number;
      player_bye_week: string | null;
      rank_min?: string | number | null;
      rank_max?: string | number | null;
      rank_std?: string | number | null;
    }>;
  };
  if (!Array.isArray(json.players) || json.players.length < 200) {
    throw new Error(`FantasyPros ${scoring}: too few players (${json.players?.length ?? 0})`);
  }
  return json.players.map((p) => ({
    name: p.player_name,
    team: p.player_team_id,
    pos: p.player_position_id,
    rank: p.rank_ecr,
    tier: p.tier,
    bye: p.player_bye_week ? Number(p.player_bye_week) || null : null,
    posRank: typeof p.pos_rank === 'string' ? Number(p.pos_rank.replace(/^[A-Z]+/, '')) || null : null,
    rankMin: p.rank_min != null ? Number(p.rank_min) || null : null,
    rankMax: p.rank_max != null ? Number(p.rank_max) || null : null,
    rankStd: p.rank_std != null ? Number(p.rank_std) || null : null,
  }));
}
