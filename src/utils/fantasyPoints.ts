import type { CustomScoringRules, Player, PlayerProjectionStats } from '../data/types';

export const STANDARD_SCORING: CustomScoringRules = {
  passYd: 0.04,
  passTd: 4,
  passInt: -2,
  passTwoPt: 2,
  rushYd: 0.1,
  rushTd: 6,
  rushTwoPt: 2,
  reception: 0,
  recYd: 0.1,
  recTd: 6,
  recTwoPt: 2,
  fumLost: -2,
  tePremium: 0,
  fgMade: 3,
  fgMiss: -1,
  fg40_49: 4,
  fg50Plus: 5,
  xpMade: 1,
  xpMiss: -1,
  dstSack: 1,
  dstInt: 2,
  dstFumRec: 2,
  dstTd: 6,
  dstSafety: 2,
  dstBlk: 2,
};

export const HALF_PPR_SCORING: CustomScoringRules = { ...STANDARD_SCORING, reception: 0.5 };
export const FULL_PPR_SCORING: CustomScoringRules = { ...STANDARD_SCORING, reception: 1 };

const SCORING_FIELDS: (keyof CustomScoringRules)[] = [
  'passYd',
  'passTd',
  'passInt',
  'passTwoPt',
  'rushYd',
  'rushTd',
  'rushTwoPt',
  'reception',
  'recYd',
  'recTd',
  'recTwoPt',
  'fumLost',
  'tePremium',
  'fgMade',
  'fgMiss',
  'fg40_49',
  'fg50Plus',
  'xpMade',
  'xpMiss',
  'dstSack',
  'dstInt',
  'dstFumRec',
  'dstTd',
  'dstSafety',
  'dstBlk',
];

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeCustomScoringRules(raw: Partial<CustomScoringRules> | undefined): CustomScoringRules {
  const base = FULL_PPR_SCORING;
  if (!raw) return { ...base };

  if ('receptionPoints' in raw && !('passYd' in raw)) {
    const receptionPoints = num((raw as { receptionPoints?: number }).receptionPoints, base.reception);
    return { ...STANDARD_SCORING, reception: Math.max(0, Math.min(2, Math.round(receptionPoints * 4) / 4)) };
  }

  const next = { ...base };
  for (const key of SCORING_FIELDS) {
    if (raw[key] != null) next[key] = num(raw[key], base[key]);
  }
  return next;
}

export function scoringRulesLabel(rules: CustomScoringRules): string {
  if (rulesMatch(rules, STANDARD_SCORING)) return 'Standard';
  if (rulesMatch(rules, HALF_PPR_SCORING)) return 'Half PPR';
  if (rulesMatch(rules, FULL_PPR_SCORING)) return 'Full PPR';
  if (rules.tePremium > 0) return `Custom (+${rules.reception} PPR, TE+${rules.tePremium})`;
  return `Custom (${rules.reception} PPR/rec)`;
}

export function rulesMatch(a: CustomScoringRules, b: CustomScoringRules): boolean {
  return SCORING_FIELDS.every((key) => a[key] === b[key]);
}

function roundPts(value: number): number {
  return Math.round(value * 10) / 10;
}

function sleeperFallbackPts(stats: PlayerProjectionStats, rules: CustomScoringRules): number | null {
  if (rulesMatch(rules, STANDARD_SCORING) && stats.ptsStd != null) return stats.ptsStd;
  if (rulesMatch(rules, FULL_PPR_SCORING) && stats.ptsPpr != null) return stats.ptsPpr;
  if (rulesMatch(rules, HALF_PPR_SCORING) && stats.ptsHalfPpr != null) return stats.ptsHalfPpr;
  if (stats.ptsStd != null && stats.ptsPpr != null) {
    const weight = rules.reception;
    if (weight <= 0) return stats.ptsStd;
    if (weight >= 1) return stats.ptsPpr;
    return stats.ptsStd + (stats.ptsPpr - stats.ptsStd) * weight;
  }
  return stats.ptsPpr ?? stats.ptsStd ?? stats.ptsHalfPpr ?? null;
}

function calculateKPoints(stats: PlayerProjectionStats, rules: CustomScoringRules): number | null {
  const xpm = stats.xpm ?? 0;
  const xpmiss = stats.xpmiss ?? 0;
  const fg40 = stats.fgm40_49 ?? 0;
  const fg50 = stats.fgm50Plus ?? 0;
  const fgMiss40 = stats.fgmiss40_49 ?? 0;
  const fgMiss50 = stats.fgmiss50Plus ?? 0;

  if (xpm === 0 && fg40 === 0 && fg50 === 0) {
    return sleeperFallbackPts(stats, rules);
  }

  const fgShort = Math.max(0, (stats.fgm ?? 0) - fg40 - fg50);
  let pts = 0;
  pts += fgShort * rules.fgMade;
  pts += fg40 * rules.fg40_49;
  pts += fg50 * rules.fg50Plus;
  pts += (fgMiss40 + fgMiss50) * rules.fgMiss;
  pts += xpm * rules.xpMade;
  pts += xpmiss * rules.xpMiss;
  return roundPts(pts);
}

function calculateDstPoints(stats: PlayerProjectionStats, rules: CustomScoringRules): number | null {
  const sacks = stats.sacks ?? 0;
  const ints = stats.interceptions ?? 0;
  const fumRec = stats.fumRec ?? 0;
  const td =
    (stats.defTd ?? 0) +
    (stats.defKrTd ?? 0) +
    (stats.defPrTd ?? 0) +
    (stats.stTd ?? 0);
  const blk = stats.blkKick ?? 0;
  const safety = stats.safety ?? 0;

  if (sacks === 0 && ints === 0 && fumRec === 0 && td === 0 && blk === 0 && safety === 0) {
    return sleeperFallbackPts(stats, rules);
  }

  let pts = 0;
  pts += sacks * rules.dstSack;
  pts += ints * rules.dstInt;
  pts += fumRec * rules.dstFumRec;
  pts += td * rules.dstTd;
  pts += blk * rules.dstBlk;
  pts += safety * rules.dstSafety;
  return roundPts(pts);
}

export function calculateProjectedPoints(
  pos: string,
  stats: PlayerProjectionStats | null | undefined,
  rules: CustomScoringRules,
): number | null {
  if (!stats) return null;

  if (pos === 'K') return calculateKPoints(stats, rules);
  if (pos === 'DST') return calculateDstPoints(stats, rules);

  let pts = 0;
  pts += (stats.passYd ?? 0) * rules.passYd;
  pts += (stats.passTd ?? 0) * rules.passTd;
  pts += (stats.passInt ?? 0) * rules.passInt;
  pts += (stats.passTwoPt ?? 0) * rules.passTwoPt;
  pts += (stats.rushYd ?? 0) * rules.rushYd;
  pts += (stats.rushTd ?? 0) * rules.rushTd;
  pts += (stats.rushTwoPt ?? 0) * rules.rushTwoPt;
  pts += (stats.rec ?? 0) * rules.reception;
  pts += (stats.recYd ?? 0) * rules.recYd;
  pts += (stats.recTd ?? 0) * rules.recTd;
  pts += (stats.recTwoPt ?? 0) * rules.recTwoPt;
  pts += (stats.fumLost ?? 0) * rules.fumLost;
  if (pos === 'TE') pts += (stats.rec ?? 0) * rules.tePremium;

  if (pts <= 0) return sleeperFallbackPts(stats, rules);
  return roundPts(pts);
}

export function getPlayerProjectedPoints(player: Player, rules: CustomScoringRules): number | null {
  return calculateProjectedPoints(player.pos, player.projections, rules);
}

export function buildProjectedRankMap(players: Player[], rules: CustomScoringRules): Map<string, number> {
  const ranked = players
    .map((player) => ({ id: player.id, pts: getPlayerProjectedPoints(player, rules) }))
    .filter((entry): entry is { id: string; pts: number } => entry.pts != null)
    .sort((a, b) => b.pts - a.pts);

  const map = new Map<string, number>();
  ranked.forEach((entry, index) => map.set(entry.id, index + 1));
  return map;
}

export const SCORING_RULE_PRESETS: { label: string; rules: CustomScoringRules }[] = [
  { label: 'Standard', rules: STANDARD_SCORING },
  { label: 'Half PPR', rules: HALF_PPR_SCORING },
  { label: 'Full PPR', rules: FULL_PPR_SCORING },
];

export const SCORING_RULE_FIELDS: { key: keyof CustomScoringRules; label: string; step: number }[] = [
  { key: 'passYd', label: 'Pass yd', step: 0.01 },
  { key: 'passTd', label: 'Pass TD', step: 1 },
  { key: 'passInt', label: 'INT', step: 1 },
  { key: 'passTwoPt', label: 'Pass 2PT', step: 1 },
  { key: 'rushYd', label: 'Rush yd', step: 0.01 },
  { key: 'rushTd', label: 'Rush TD', step: 1 },
  { key: 'rushTwoPt', label: 'Rush 2PT', step: 1 },
  { key: 'reception', label: 'Rec', step: 0.25 },
  { key: 'recYd', label: 'Rec yd', step: 0.01 },
  { key: 'recTd', label: 'Rec TD', step: 1 },
  { key: 'recTwoPt', label: 'Rec 2PT', step: 1 },
  { key: 'fumLost', label: 'Fumble', step: 1 },
  { key: 'tePremium', label: 'TE premium', step: 0.25 },
  { key: 'fgMade', label: 'FG made', step: 1 },
  { key: 'fgMiss', label: 'FG miss', step: 1 },
  { key: 'fg40_49', label: 'FG 40-49', step: 1 },
  { key: 'fg50Plus', label: 'FG 50+', step: 1 },
  { key: 'xpMade', label: 'XP made', step: 1 },
  { key: 'xpMiss', label: 'XP miss', step: 1 },
  { key: 'dstSack', label: 'DST sack', step: 1 },
  { key: 'dstInt', label: 'DST INT', step: 1 },
  { key: 'dstFumRec', label: 'DST FR', step: 1 },
  { key: 'dstTd', label: 'DST TD', step: 1 },
  { key: 'dstSafety', label: 'DST safety', step: 1 },
  { key: 'dstBlk', label: 'DST block', step: 1 },
];
