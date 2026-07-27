import type { RawPlayerRow } from '../utils.js';

export async function fetchSleeperAdp(season: number): Promise<RawPlayerRow[]> {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => `position[]=${p}`).join('&');
  const url = `https://api.sleeper.com/projections/nfl/${season}?season_type=regular&${positions}&order_by=adp_ppr`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Sleeper: ${res.status}`);
  const json = (await res.json()) as Array<{
    team: string | null;
    player: { first_name: string; last_name: string; position: string };
    stats: Record<string, number | undefined>;
  }>;
  if (!Array.isArray(json) || json.length < 100) {
    throw new Error(`Sleeper: too few rows (${json.length ?? 0})`);
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
  })) as RawPlayerRow[];
}

export async function fetchSleeperPlayers(): Promise<
  Array<{
    name: string;
    team: string;
    pos: string;
    injuryStatus: string | null;
    yearsExp: number | null;
  }>
> {
  const res = await fetch('https://api.sleeper.app/v1/players/nfl', {
    headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
    signal: AbortSignal.timeout(60_000),
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
      years_exp?: number | null;
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
      yearsExp: p.years_exp ?? null,
    }));
}
