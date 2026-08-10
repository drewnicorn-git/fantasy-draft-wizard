import type { BotPersonality, DraftConfig, Player } from '../data/types';
import { DEFAULT_ROSTER_POSITIONS } from '../data/types';
import { getAdp, getConsensus, getPosRank } from '../utils/scoring';
import { getBotRosterLimits, type BotRosterLimits } from '../utils/leagueSettings';
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

/** @deprecated Use getBotRosterLimits(config.rosterPositions) */
export const ROSTER_LIMITS = getBotRosterLimits(DEFAULT_ROSTER_POSITIONS);

export function resolveRosterLimits(config: DraftConfig): BotRosterLimits {
  return getBotRosterLimits(config.rosterPositions ?? DEFAULT_ROSTER_POSITIONS);
}

export function countRoster(roster: Player[]): RosterCounts {
  const c: RosterCounts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, total: roster.length };
  for (const p of roster) {
    if (p.pos in c) c[p.pos as keyof Omit<RosterCounts, 'total'>]++;
  }
  return c;
}

function flexUsed(c: RosterCounts, limits: BotRosterLimits): number {
  const flexEligible =
    Math.max(0, c.RB - limits.RB) + Math.max(0, c.WR - limits.WR) + Math.max(0, c.TE - limits.TE);
  return Math.min(flexEligible, limits.FLEX);
}

function superflexUsed(c: RosterCounts, limits: BotRosterLimits): number {
  const qbOverflow = Math.max(0, c.QB - limits.QB);
  const flexEligible =
    Math.max(0, c.RB - limits.RB) + Math.max(0, c.WR - limits.WR) + Math.max(0, c.TE - limits.TE);
  const flexOverflow = Math.max(0, flexEligible - limits.FLEX);
  return Math.min(qbOverflow + flexOverflow, limits.SUPERFLEX);
}

function maxQbSlots(limits: BotRosterLimits): number {
  return limits.QB + limits.SUPERFLEX;
}

/** How strongly the bot wants to fill a position given roster state and draft round. */
export function rosterNeedScore(
  pos: string,
  counts: RosterCounts,
  round: number,
  personality: BotPersonality,
  limits: BotRosterLimits = ROSTER_LIMITS,
): number {
  if (limits.K === 0 && pos === 'K') return 0;
  if (limits.DST === 0 && pos === 'DST') return 0;

  if (pos === 'QB' && counts.QB >= maxQbSlots(limits)) return 0.05;
  if (pos === 'TE' && counts.TE >= limits.TE) return 0.12;
  if (pos === 'K' && counts.K >= limits.K) return 0;
  if (pos === 'DST' && counts.DST >= limits.DST) return 0;

  const startersFilled =
    counts.QB >= limits.QB &&
    counts.RB >= limits.RB &&
    counts.WR >= limits.WR &&
    counts.TE >= limits.TE &&
    flexUsed(counts, limits) >= limits.FLEX &&
    superflexUsed(counts, limits) >= limits.SUPERFLEX;

  let need = 1;

  switch (pos) {
    case 'QB':
      if (round <= 2) need = limits.SUPERFLEX > 0 ? 0.75 : 0.55;
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
      need = counts.RB < limits.RB ? 1.12 : counts.RB < limits.RB + 2 ? 0.72 : 0.32;
      if (personality === 'zero-rb' && round <= 5) need *= 0.55;
      if (personality === 'hero-rb' && round <= 3) need *= 1.35;
      break;
    case 'WR':
      need = counts.WR < limits.WR ? 1.08 : counts.WR < limits.WR + 2 ? 0.72 : 0.32;
      break;
    case 'K':
      need = limits.K > 0 && round >= Math.max(13, 18 - limits.BENCH) ? 1.5 : 0.05;
      break;
    case 'DST':
      need = limits.DST > 0 && round >= Math.max(14, 19 - limits.BENCH) ? 1.5 : 0.05;
      break;
  }

  if (startersFilled && !['K', 'DST'].includes(pos)) need *= 0.55;
  if (counts.total >= limits.totalRoster) need = 0;
  return need;
}

function positionalTierBoost(p: Player, teams: number, config: DraftConfig): number {
  const posRank = getPosRank(p, config.scoring);
  const adp = getAdp(p, config.scoring) ?? getConsensus(p, config.scoring);
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
  limits: BotRosterLimits,
): number {
  const adp = getAdp(p, config.scoring) ?? getConsensus(p, config.scoring) ?? 999;
  const adpScore = Math.exp(-adp / 75);
  const need = rosterNeedScore(p.pos, counts, round, personality, limits);
  const tierBoost = positionalTierBoost(p, config.teams, config);
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
  const limits = resolveRosterLimits(config);

  const pool = available.filter((p) => {
    if (p.pos === 'K') return limits.K > 0;
    if (p.pos === 'DST') return limits.DST > 0;
    return ['QB', 'RB', 'WR', 'TE'].includes(p.pos);
  });
  if (!pool.length) return available[0] ?? null;

  const scored = pool
    .map((p) => ({
      p,
      score: playerPickScore(p, overallPick, round, counts, config, personality, limits),
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

export function suggestedPicks(available: Player[], scoring: DraftConfig['scoring'], limit = 3): Player[] {
  return [...available]
    .filter((p) => getAdpOrConsensus(p, scoring) != null)
    .sort((a, b) => getAdpOrConsensus(a, scoring)! - getAdpOrConsensus(b, scoring)!)
    .slice(0, limit);
}

function getAdpOrConsensus(p: Player, scoring: DraftConfig['scoring']): number | null {
  return getAdp(p, scoring) ?? getConsensus(p, scoring);
}
