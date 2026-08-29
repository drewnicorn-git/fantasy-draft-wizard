import type { BotProfile, DraftConfig, DraftPick, Player } from '../data/types';
import { DEFAULT_ROSTER_POSITIONS } from '../data/types';
import { getConsensus, getPlatformAdp, getPosRank, getProjectedPoints } from '../utils/scoring';
import { getBotRosterLimits, type BotRosterLimits } from '../utils/leagueSettings';
import { computeReplacementLevels, playerVorp } from '../utils/vorp';
import { detectPositionalRun } from '../utils/analytics';
import { archetypeToPersonality } from './botProfiles';
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
  personality: ReturnType<typeof archetypeToPersonality>,
  limits: BotRosterLimits = ROSTER_LIMITS,
  profile?: BotProfile,
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
    case 'QB': {
      const qbTarget = profile?.qbTargetRound ?? (profile?.archetype === 'early-qb' ? 2 : undefined);
      if (qbTarget != null && round <= qbTarget && counts.QB < maxQbSlots(limits)) {
        need = 1.45;
      } else if (round <= 2) need = limits.SUPERFLEX > 0 ? 0.75 : 0.55;
      else if (round <= 4) need = 1.05;
      else if (round <= 7) need = 1.3;
      else if (round <= 10) need = 1.5;
      else need = 1.85;
      break;
    }
    case 'TE':
      if (profile?.archetype === 'early-te' && round <= 5 && counts.TE < limits.TE) need = 1.35;
      else if (round <= 2) need = 0.95;
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
  const adp = getPlatformAdp(p, config.adpPlatform ?? 'consensus', config.scoring) ?? getConsensus(p, config.scoring);
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

function reachMultiplier(adp: number, overallPick: number, reachFactor: number): number {
  const diff = adp - overallPick;
  let mult = 1;
  if (diff > 18) mult = 0.5;
  else if (diff > 12) mult = 0.72;
  else if (diff < -18) mult = 1.12;
  else if (diff < -8) mult = 1.06;
  if (diff < 0) mult *= reachFactor;
  else if (diff > 0) mult /= reachFactor;
  return mult;
}

function adpScore(p: Player, overallPick: number, config: DraftConfig, adpAdherence: number): number {
  const platform = config.adpPlatform ?? 'consensus';
  const adp = getPlatformAdp(p, platform, config.scoring) ?? 999;
  const diff = adp - overallPick;
  const proximity = Math.exp(-Math.abs(diff) / 24);
  const reachBonus = diff < -6 ? 1 + Math.min(0.35, (-diff / 40) * adpAdherence) : 1;
  const waitPenalty = diff > 12 ? 0.65 : 1;
  return proximity * reachBonus * waitPenalty * (0.65 + adpAdherence * 0.35);
}

function homerBoost(p: Player, profile: BotProfile): number {
  const teams = profile.homerTeams ?? [];
  if (!teams.length) return 1;
  return teams.includes(p.team) ? 1.28 : 1;
}

function runReactionBoost(p: Player, recentPicks: DraftPick[]): number {
  if (!['RB', 'WR', 'TE', 'QB'].includes(p.pos)) return 1;
  if (detectPositionalRun(recentPicks, p.pos, 4, 3)) return 1.12;
  return 1;
}

function playerPickScore(
  p: Player,
  overallPick: number,
  round: number,
  counts: RosterCounts,
  config: DraftConfig,
  profile: BotProfile,
  limits: BotRosterLimits,
  vorpWeight: number,
  vorp: number | null,
): number {
  const personality = archetypeToPersonality(profile.archetype);
  const need = rosterNeedScore(p.pos, counts, round, personality, limits, profile);
  const tierBoost = positionalTierBoost(p, config.teams, config);
  const platform = config.adpPlatform ?? 'consensus';
  const adp = getPlatformAdp(p, platform, config.scoring) ?? getConsensus(p, config.scoring) ?? 999;
  const reach = reachMultiplier(adp, overallPick, profile.reachFactor);
  const adpPart = adpScore(p, overallPick, config, profile.adpAdherence);

  const projected = getProjectedPoints(p);
  const baseValue =
    vorp != null && vorp > 0
      ? vorp * vorpWeight + adpPart * profile.adpAdherence
      : projected != null
        ? projected / 320
        : Math.exp(-adp / 75);

  const noise = profile.archetype === 'sharp' ? 1 : 0.9 + Math.random() * 0.2;
  return baseValue * need * tierBoost * reach * homerBoost(p, profile) * noise;
}

export function botPick(
  available: Player[],
  roster: Player[],
  overallPick: number,
  config: DraftConfig,
  profile: BotProfile,
  recentPicks: DraftPick[] = [],
): Player | null {
  const { round } = roundFromOverall(overallPick, config.teams);
  const counts = countRoster(roster);
  const limits = resolveRosterLimits(config);
  const levels = computeReplacementLevels(available, config, config.scoringSettings);
  const vorpWeight = profile.archetype === 'sharp' ? 0.55 : 1;

  const pool = available.filter((p) => {
    if (p.pos === 'K') return limits.K > 0;
    if (p.pos === 'DST') return limits.DST > 0;
    return ['QB', 'RB', 'WR', 'TE'].includes(p.pos);
  });
  if (!pool.length) return available[0] ?? null;

  const scored = pool
    .map((p) => {
      const vorp = playerVorp(p, levels, config.scoringSettings);
      return {
        p,
        score:
          playerPickScore(p, overallPick, round, counts, config, profile, limits, vorpWeight, vorp) *
          runReactionBoost(p, recentPicks),
      };
    })
    .sort((a, b) => b.score - a.score);

  if (profile.archetype === 'sharp') {
    return scored[0]?.p ?? pool[0] ?? null;
  }

  const topN = profile.archetype === 'reachy' ? 12 : 8;
  const top = scored.slice(0, Math.min(topN, scored.length));
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
    .filter((p) => getPlatformAdp(p, 'consensus', scoring) != null)
    .sort(
      (a, b) =>
        (getPlatformAdp(a, 'consensus', scoring) ?? 999) - (getPlatformAdp(b, 'consensus', scoring) ?? 999),
    )
    .slice(0, limit);
}
