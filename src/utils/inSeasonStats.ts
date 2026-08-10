import type { InSeasonPlayerValue, ScoringFormat } from '../data/types';

export interface ProjDisplay {
  text: string;
  isFallback: boolean;
}

export function getPrevWeekPts(row: InSeasonPlayerValue | undefined, scoring: ScoringFormat): number | null {
  if (!row) return null;
  const legacy = scoring === 'ppr' ? row.weekProjPpr : row.weekProjStd;
  const value = scoring === 'ppr' ? row.prevWeekPtsPpr : row.prevWeekPtsStd;
  return value ?? legacy ?? null;
}

export function getProjPts(row: InSeasonPlayerValue | undefined, scoring: ScoringFormat): number | null {
  if (!row) return null;
  const value = scoring === 'ppr' ? row.projPtsPpr : row.projPtsStd;
  if (value != null) return value;
  const legacy = scoring === 'ppr' ? row.weekProjPpr : row.weekProjStd;
  return legacy ?? null;
}

export function isProjFallback(row: InSeasonPlayerValue | undefined): boolean {
  if (!row) return false;
  if (row.projIsFallback != null) return row.projIsFallback;
  return row.projPtsPpr == null && row.projPtsStd == null;
}

export function formatInSeasonPts(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—';
  return value.toFixed(decimals);
}

export function formatProjDisplay(row: InSeasonPlayerValue | undefined, scoring: ScoringFormat): ProjDisplay {
  if (row && row.hasStats === false) return { text: 'No stats', isFallback: false };
  const value = getProjPts(row, scoring);
  if (value == null) return { text: '—', isFallback: false };
  const fallback = isProjFallback(row);
  return { text: `${value.toFixed(1)}${fallback ? '*' : ''}`, isFallback: fallback };
}

export function hasInSeasonStats(row: InSeasonPlayerValue | undefined): boolean {
  if (!row) return false;
  if (row.hasStats != null) return row.hasStats;
  return (
    (row.seasonPtsStd ?? 0) > 0 ||
    (row.seasonPtsPpr ?? 0) > 0 ||
    getPrevWeekPts(row, 'std') != null ||
    getProjPts(row, 'std') != null
  );
}

export function formatPrevWeekDisplay(row: InSeasonPlayerValue | undefined, scoring: ScoringFormat): string {
  if (row && row.hasStats === false) return 'No stats';
  return formatInSeasonPts(getPrevWeekPts(row, scoring));
}
