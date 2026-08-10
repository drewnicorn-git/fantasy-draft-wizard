import type { RawPlayerRow } from '../utils.js';

export function mapSleeperProjectionStats(stats: Record<string, number | undefined>): NonNullable<RawPlayerRow['projections']> {
  return {
    passYd: stats.pass_yd ?? null,
    passTd: stats.pass_td ?? null,
    passInt: stats.pass_int ?? null,
    passTwoPt: stats.pass_2pt ?? null,
    rushYd: stats.rush_yd ?? null,
    rushTd: stats.rush_td ?? null,
    rushTwoPt: stats.rush_2pt ?? null,
    rec: stats.rec ?? null,
    recYd: stats.rec_yd ?? null,
    recTd: stats.rec_td ?? null,
    recTwoPt: stats.rec_2pt ?? null,
    fumLost: stats.fum_lost ?? null,
    fgm40_49: stats.fgm_40_49 ?? null,
    fgm50Plus: stats.fgm_50p ?? null,
    fgmiss40_49: stats.fgmiss_40_49 ?? null,
    fgmiss50Plus: stats.fgmiss_50p ?? null,
    xpm: stats.xpm ?? null,
    xpmiss: stats.xpmiss ?? null,
    sacks: stats.sack ?? null,
    interceptions: stats.int ?? null,
    fumRec: stats.fum_rec ?? null,
    defTd: stats.def_fum_td ?? null,
    defKrTd: stats.def_kr_td ?? null,
    defPrTd: stats.def_pr_td ?? null,
    stTd: stats.st_td ?? null,
    blkKick: stats.blk_kick ?? null,
    safety: stats.safe ?? null,
    ptsStd: stats.pts_std ?? null,
    ptsPpr: stats.pts_ppr ?? null,
    ptsHalfPpr: stats.pts_half_ppr ?? null,
  };
}

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
    projections: mapSleeperProjectionStats(p.stats ?? {}),
  })) as RawPlayerRow[];
}

export async function fetchSleeperPlayers(): Promise<
  Array<{
    id: string;
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
  return Object.entries(json)
    .filter(([, p]) => p.position && positions.has(p.position) && p.team)
    .map(([id, p]) => ({
      id,
      name: p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      pos: p.position === 'DEF' ? 'DST' : p.position!,
      team: p.team!,
      injuryStatus: p.injury_status ?? null,
      yearsExp: p.years_exp ?? null,
    }));
}
