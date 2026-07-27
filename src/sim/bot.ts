import type { BotPersonality, DraftConfig, Player, ScoringFormat } from '../data/types';
import { getConsensus } from '../utils/scoring';
import { roundFromOverall } from './snake';

export interface RosterCounts {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  K: number;
  DST: number;
  total: number;
}

export const ROSTER_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1, FLEX: 1, BENCH: 6 };

export function countRoster(roster: Player[]): RosterCounts {
  const c: RosterCounts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, total: roster.length };
  for (const p of roster) {
    if (p.pos in c) c[p.pos as keyof Omit<RosterCounts, 'total'>]++;
  }
  return c;
}

function flexUsed(c: RosterCounts): number {
  const flexEligible = Math.max(0, c.RB - ROSTER_LIMITS.RB) + Math.max(0, c.WR - ROSTER_LIMITS.WR) + Math.max(0, c.TE - ROSTER_LIMITS.TE);
  return Math.min(flexEligible, ROSTER_LIMITS.FLEX);
}

export function rosterNeedScore(pos: string, counts: RosterCounts, round: number, personality: BotPersonality): number {
  const startersFilled =
    counts.QB >= ROSTER_LIMITS.QB &&
    counts.RB >= ROSTER_LIMITS.RB &&
    counts.WR >= ROSTER_LIMITS.WR &&
    counts.TE >= ROSTER_LIMITS.TE &&
    flexUsed(counts) >= ROSTER_LIMITS.FLEX;

  let need = 1;
  if (pos === 'QB' && counts.QB >= ROSTER_LIMITS.QB) need = 0.05;
  if (pos === 'RB') {
    need = counts.RB < ROSTER_LIMITS.RB ? 1.4 : counts.RB < ROSTER_LIMITS.RB + 2 ? 0.8 : 0.3;
    if (personality === 'zero-rb' && round <= 5) need *= 0.5;
    if (personality === 'hero-rb' && round <= 3) need *= 1.5;
  }
  if (pos === 'WR') {
    need = counts.WR < ROSTER_LIMITS.WR ? 1.3 : counts.WR < ROSTER_LIMITS.WR + 2 ? 0.85 : 0.35;
  }
  if (pos === 'TE') need = counts.TE >= ROSTER_LIMITS.TE ? 0.15 : round > 8 ? 1.2 : 0.5;
  if (pos === 'K') need = counts.K >= ROSTER_LIMITS.K ? 0 : round >= 13 ? 1.5 : 0.05;
  if (pos === 'DST') need = counts.DST >= ROSTER_LIMITS.DST ? 0 : round >= 14 ? 1.5 : 0.05;

  if (startersFilled && !['K', 'DST'].includes(pos)) need *= 0.6;
  if (counts.total >= 15) need = 0;
  return need;
}

export function botPick(
  available: Player[],
  roster: Player[],
  overallPick: number,
  config: DraftConfig,
  personality: BotPersonality,
): Player {
  const { round } = roundFromOverall(overallPick, config.teams);
  const counts = countRoster(roster);
  const scoring: ScoringFormat = config.scoring;

  const scored = available
    .filter((p) => ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(p.pos))
    .map((p) => {
      const adp = p.adp[scoring] ?? getConsensus(p, scoring) ?? 999;
      const adpScore = 1 / Math.max(adp, 1);
      const need = rosterNeedScore(p.pos, counts, round, personality);
      const noise = 0.85 + Math.random() * 0.3;
      return { p, score: adpScore * need * noise };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return available[0];
  const top = scored.slice(0, Math.min(8, scored.length));
  const total = top.reduce((s, x) => s + x.score, 0);
  let r = Math.random() * total;
  for (const t of top) {
    r -= t.score;
    if (r <= 0) return t.p;
  }
  return top[0]?.p ?? available[0]!;
}

export function suggestedPicks(
  available: Player[],
  scoring: ScoringFormat,
  limit = 3,
): Player[] {
  return [...available]
    .filter((p) => getAdpOrConsensus(p, scoring) != null)
    .sort((a, b) => getAdpOrConsensus(a, scoring)! - getAdpOrConsensus(b, scoring)!)
    .slice(0, limit);
}

function getAdpOrConsensus(p: Player, scoring: ScoringFormat): number | null {
  return p.adp[scoring] ?? getConsensus(p, scoring);
}
