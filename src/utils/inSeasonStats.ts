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
  const value = getProjPts(row, scoring);
  if (value == null) return { text: '—', isFallback: false };
  const fallback = isProjFallback(row);
  return { text: `${value.toFixed(1)}${fallback ? '*' : ''}`, isFallback: fallback };
}

export function formatPrevWeekDisplay(row: InSeasonPlayerValue | undefined, scoring: ScoringFormat): string {
  return formatInSeasonPts(getPrevWeekPts(row, scoring));
}
