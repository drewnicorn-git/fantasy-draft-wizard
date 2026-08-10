import type { InSeasonData, InjuriesData, Player, ScoringFormat } from '../data/types';
import { getActiveLeague } from '../state/leaguesStore';
import { formatPrevWeekDisplay, formatProjDisplay } from './inSeasonStats';
import { getAdp, getConsensus, getPosRank, getProjectedPoints } from './scoring';
import { formatTeamDepthLabel } from './position';
import { scoringSettingsToLegacyFormat } from './leagueSettings';

export interface PlayerCompareMetric {
  label: string;
  values: string[];
  highlightBest?: boolean;
  lowerIsBetter?: boolean;
}

function injuryLabel(player: Player, injuries: InjuriesData | null): string {
  if (player.injuryStatus?.trim()) return player.injuryStatus;
  const entry = injuries?.entries.find((e) => e.playerId === player.id);
  return entry?.status ?? '—';
}

function seasonPts(player: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): string {
  const row = inSeason?.players[player.id];
  if (!row) return '—';
  const pts = scoring === 'ppr' ? row.seasonPtsPpr : row.seasonPtsStd;
  return pts != null ? pts.toFixed(1) : '—';
}

function numericOrNull(value: string): number | null {
  if (value === '—' || !value.trim()) return null;
  const n = Number(value.replace('*', '').replace('★', '').trim());
  return Number.isFinite(n) ? n : null;
}

function applyHighlights(rows: PlayerCompareMetric[]): PlayerCompareMetric[] {
  return rows.map((row) => {
    if (!row.highlightBest || row.values.length < 2) return row;
    const nums = row.values.map((v) => numericOrNull(v));
    const valid = nums.filter((n): n is number => n != null);
    if (valid.length < 2) return row;
    const best = row.lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
    return {
      ...row,
      values: row.values.map((v, i) => {
        const n = nums[i];
        if (n == null || n !== best) return v;
        return `${v} ★`;
      }),
    };
  });
}

export function buildPlayerCompareMetrics(
  players: Player[],
  opts: {
    scoring?: ScoringFormat;
    inSeason?: InSeasonData | null;
    injuries?: InjuriesData | null;
  } = {},
): PlayerCompareMetric[] {
  const league = getActiveLeague();
  const scoring = opts.scoring ?? scoringSettingsToLegacyFormat(league.scoringSettings);
  const inSeason = opts.inSeason ?? null;
  const injuries = opts.injuries ?? null;

  const rows: PlayerCompareMetric[] = [
    { label: 'Name', values: players.map((p) => p.name) },
    { label: 'Pos', values: players.map((p) => String(p.pos)) },
    { label: 'Team', values: players.map((p) => p.team) },
    {
      label: 'Proj pts',
      values: players.map((p) => {
        const pts = getProjectedPoints(p);
        return pts != null ? pts.toFixed(1) : '—';
      }),
      highlightBest: true,
    },
    {
      label: 'ADP',
      values: players.map((p) => {
        const adp = getAdp(p, scoring);
        return adp != null ? adp.toFixed(1) : '—';
      }),
      highlightBest: true,
      lowerIsBetter: true,
    },
    {
      label: 'Consensus',
      values: players.map((p) => {
        const c = getConsensus(p, scoring);
        return c != null ? String(c) : '—';
      }),
      highlightBest: true,
      lowerIsBetter: true,
    },
    {
      label: 'Pos rank',
      values: players.map((p) => {
        const r = getPosRank(p, scoring);
        return r != null ? String(r) : '—';
      }),
      highlightBest: true,
      lowerIsBetter: true,
    },
    {
      label: 'Tier',
      values: players.map((p) => (p.tier != null ? String(p.tier) : '—')),
      highlightBest: true,
      lowerIsBetter: true,
    },
    { label: 'Bye', values: players.map((p) => (p.bye != null ? String(p.bye) : '—')) },
    { label: 'Depth', values: players.map((p) => formatTeamDepthLabel(p)) },
    { label: 'Injury', values: players.map((p) => injuryLabel(p, injuries)) },
    {
      label: 'Season pts',
      values: players.map((p) => seasonPts(p, inSeason, scoring)),
      highlightBest: true,
    },
    {
      label: 'Week proj',
      values: players.map((p) => formatProjDisplay(inSeason?.players[p.id], scoring).text),
      highlightBest: true,
    },
    {
      label: 'Prev week',
      values: players.map((p) => formatPrevWeekDisplay(inSeason?.players[p.id], scoring)),
      highlightBest: true,
    },
  ];

  return applyHighlights(rows);
}

export function resolveComparePlayers(allPlayers: Player[], ids: string[]): Player[] {
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Player => !!p);
}
