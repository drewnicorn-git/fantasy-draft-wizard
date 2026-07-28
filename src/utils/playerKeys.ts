export function currentDraftSeason(now = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  return month >= 2 ? year : year - 1;
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

export function normalizePos(pos: string): string {
  const p = pos.toUpperCase();
  if (p === 'DEF' || p === 'D/ST' || p === 'DST') return 'DST';
  return p;
}

export function lastNameToken(name: string): string {
  const parts = normalizeName(name).split(' ').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export function canonicalKey(name: string, pos: string): string {
  return `${normalizeName(name)}|${normalizePos(pos)}`;
}

export function isValidPlayerName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  if (/^depth player\b/i.test(n)) return false;
  if (/^(test|unknown|n\/a|tbd)$/i.test(n)) return false;
  return true;
}

export interface RawPlayerRow {
  name: string;
  team: string;
  pos: string;
  rank?: number;
  tier?: number | null;
  bye?: number | null;
  adp?: number | null;
  posRank?: number | null;
  adpStd?: number | null;
  adpPpr?: number | null;
}
