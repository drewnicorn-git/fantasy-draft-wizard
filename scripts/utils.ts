export type ScoringKey = 'STD' | 'PPR';

export interface RawPlayerRow {
  name: string;
  team: string;
  pos: string;
  rank?: number;
  tier?: number | null;
  bye?: number | null;
  adp?: number | null;
  posRank?: number | null;
  rankMin?: number | null;
  rankMax?: number | null;
  rankStd?: number | null;
  projections?: Record<string, number | null | undefined>;
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '')
    .replace(/[''`.]/g, '')
    .replace(/\b([a-zA-Z])\.\s*/g, '$1')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function playerKey(name: string, team: string, pos: string): string {
  return `${normalizeName(name)}|${team.toUpperCase()}|${pos.toUpperCase()}`;
}

export function normalizePos(pos: string): string {
  const p = pos.toUpperCase();
  if (p === 'DEF' || p === 'D/ST' || p === 'DST') return 'DST';
  return p;
}

export function lastNameToken(name: string): string {
  const parts = normalizeName(name).split(' ').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
