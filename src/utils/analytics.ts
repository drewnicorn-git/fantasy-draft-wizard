import type { Player, ScoringFormat } from '../data/types';

/** Estimate probability a player is still available at your next pick. */
export function pickPredictor(
  player: Player,
  currentPick: number,
  picksUntilNext: number,
  scoring: ScoringFormat,
): number {
  const adp = player.adp[scoring];
  if (adp == null) return 50;
  const targetPick = currentPick + picksUntilNext;
  const diff = adp - targetPick;
  if (diff >= 12) return 98;
  if (diff >= 6) return 85;
  if (diff >= 3) return 70;
  if (diff >= 0) return 55;
  if (diff >= -3) return 35;
  if (diff >= -6) return 18;
  return 5;
}

export function isTierBreak(current: Player | undefined, next: Player | undefined): boolean {
  if (!current?.tier || !next?.tier) return false;
  return next.tier > current.tier;
}

export function detectPositionalRun(recentPicks: { pos: string }[], pos: string, window = 4, threshold = 3): boolean {
  const slice = recentPicks.slice(-window);
  return slice.filter((p) => p.pos === pos).length >= threshold;
}

export function byeWeekConflicts(roster: Player[]): number[] {
  const byWeek = new Map<number, number>();
  for (const p of roster) {
    if (p.bye == null || !['QB', 'RB', 'WR', 'TE'].includes(p.pos)) continue;
    byWeek.set(p.bye, (byWeek.get(p.bye) ?? 0) + 1);
  }
  return [...byWeek.entries()].filter(([, n]) => n >= 3).map(([w]) => w);
}
