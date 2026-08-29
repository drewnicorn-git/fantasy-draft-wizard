import type { Player } from '../data/types';

export function countByPosition(roster: Player[]): Record<'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST', number> {
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  for (const p of roster) {
    const pos = String(p.pos).toUpperCase();
    if (pos === 'DEF' || pos === 'DST') counts.DST++;
    else if (pos in counts) counts[pos as keyof typeof counts]++;
  }
  return counts;
}
