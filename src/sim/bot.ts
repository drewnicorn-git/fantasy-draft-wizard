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



/** How strongly the bot wants to fill a position given roster state and draft round. */

export function rosterNeedScore(pos: string, counts: RosterCounts, round: number, personality: BotPersonality): number {

  if (pos === 'QB' && counts.QB >= ROSTER_LIMITS.QB) return 0.05;

  if (pos === 'TE' && counts.TE >= ROSTER_LIMITS.TE) return 0.12;

  if (pos === 'K' && counts.K >= ROSTER_LIMITS.K) return 0;

  if (pos === 'DST' && counts.DST >= ROSTER_LIMITS.DST) return 0;



  const startersFilled =

    counts.QB >= ROSTER_LIMITS.QB &&

    counts.RB >= ROSTER_LIMITS.RB &&

    counts.WR >= ROSTER_LIMITS.WR &&

    counts.TE >= ROSTER_LIMITS.TE &&

    flexUsed(counts) >= ROSTER_LIMITS.FLEX;



  let need = 1;



  switch (pos) {

    case 'QB':

      if (round <= 2) need = 0.55;

      else if (round <= 4) need = 1.05;

      else if (round <= 7) need = 1.3;

      else if (round <= 10) need = 1.5;

      else need = 1.85;

      break;

    case 'TE':

      if (round <= 2) need = 0.95;

      else if (round <= 5) need = 1.1;

      else if (round <= 8) need = 1;

      else if (round <= 11) need = 1.25;

      else need = 1.55;

      break;

    case 'RB':

      need = counts.RB < ROSTER_LIMITS.RB ? 1.12 : counts.RB < ROSTER_LIMITS.RB + 2 ? 0.72 : 0.32;

      if (personality === 'zero-rb' && round <= 5) need *= 0.55;

      if (personality === 'hero-rb' && round <= 3) need *= 1.35;

      break;

    case 'WR':

      need = counts.WR < ROSTER_LIMITS.WR ? 1.08 : counts.WR < ROSTER_LIMITS.WR + 2 ? 0.72 : 0.32;

      break;

    case 'K':

      need = round >= 13 ? 1.5 : 0.05;

      break;

    case 'DST':

      need = round >= 14 ? 1.5 : 0.05;

      break;

  }



  if (startersFilled && !['K', 'DST'].includes(pos)) need *= 0.55;

  if (counts.total >= 15) need = 0;

  return need;

}



/** Boost elite QBs/TEs when their ADP says they belong in the current range. */

function positionalTierBoost(p: Player, teams: number, scoring: ScoringFormat): number {

  const posRank = p.posRank[scoring];

  const adp = p.adp[scoring] ?? getConsensus(p, scoring);

  if (posRank == null || adp == null) return 1;



  const adpRound = adp / teams;



  if (p.pos === 'TE') {

    if (posRank <= 2 && adpRound <= 2.5) return 1.22;

    if (posRank <= 4 && adpRound <= 5) return 1.1;

    if (posRank <= 8 && adpRound <= 8) return 1.05;

  }



  if (p.pos === 'QB') {

    if (posRank <= 2 && adpRound <= 4) return 1.18;

    if (posRank <= 6 && adpRound <= 6) return 1.1;

    if (posRank <= 10 && adpRound <= 8) return 1.05;

  }



  return 1;

}



/** Penalize reaching; reward players falling below ADP. */

function reachMultiplier(adp: number, overallPick: number): number {

  const diff = adp - overallPick;

  if (diff > 18) return 0.5;

  if (diff > 12) return 0.72;

  if (diff < -18) return 1.12;

  if (diff < -8) return 1.06;

  return 1;

}



function playerPickScore(

  p: Player,

  overallPick: number,

  round: number,

  counts: RosterCounts,

  config: DraftConfig,

  personality: BotPersonality,

  scoring: ScoringFormat,

): number {

  const adp = p.adp[scoring] ?? getConsensus(p, scoring) ?? 999;

  const adpScore = Math.exp(-adp / 75);

  const need = rosterNeedScore(p.pos, counts, round, personality);

  const tierBoost = positionalTierBoost(p, config.teams, scoring);

  const reach = reachMultiplier(adp, overallPick);

  const noise = 0.88 + Math.random() * 0.24;

  return adpScore * need * tierBoost * reach * noise;

}



export function botPick(

  available: Player[],

  roster: Player[],

  overallPick: number,

  config: DraftConfig,

  personality: BotPersonality,

): Player | null {

  const { round } = roundFromOverall(overallPick, config.teams);

  const counts = countRoster(roster);

  const scoring: ScoringFormat = config.scoring;



  const pool = available.filter((p) => ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(p.pos));

  if (!pool.length) return available[0] ?? null;



  const scored = pool

    .map((p) => ({

      p,

      score: playerPickScore(p, overallPick, round, counts, config, personality, scoring),

    }))

    .sort((a, b) => b.score - a.score);



  const top = scored.slice(0, Math.min(8, scored.length));

  const total = top.reduce((s, x) => s + x.score, 0);

  if (total <= 0) return top[0]?.p ?? pool[0] ?? null;



  let r = Math.random() * total;

  for (const t of top) {

    r -= t.score;

    if (r <= 0) return t.p;

  }

  return top[0]?.p ?? pool[0] ?? null;

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


