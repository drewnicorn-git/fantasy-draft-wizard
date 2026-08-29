import type { CustomScoringRules, DraftConfig, Player } from '../data/types';
import { DEFAULT_ROSTER_POSITIONS } from '../data/types';
import { getProjectedPoints } from './scoring';
import { getBotRosterLimits, type BotRosterLimits } from './leagueSettings';

export interface ReplacementLevels {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  K: number;
  DST: number;
}

function playerPoints(p: Player, rules?: CustomScoringRules): number {
  return getProjectedPoints(p, rules) ?? 0;
}

function replacementSlotCount(pos: string, limits: BotRosterLimits, teams: number): number {
  switch (pos) {
    case 'QB':
      return (limits.QB + limits.SUPERFLEX) * teams;
    case 'RB':
      return limits.RB * teams + Math.ceil(limits.FLEX * teams * 0.45);
    case 'WR':
      return limits.WR * teams + Math.ceil(limits.FLEX * teams * 0.45);
    case 'TE':
      return limits.TE * teams + Math.ceil(limits.FLEX * teams * 0.1);
    case 'K':
      return limits.K > 0 ? limits.K * teams : 0;
    case 'DST':
      return limits.DST > 0 ? limits.DST * teams : 0;
    default:
      return teams;
  }
}

function baselineForPosition(
  available: Player[],
  pos: string,
  slotCount: number,
  rules?: CustomScoringRules,
): number {
  if (slotCount <= 0) return 0;
  const atPos = available
    .filter((p) => p.pos === pos)
    .map((p) => ({ p, pts: playerPoints(p, rules) }))
    .filter((x) => x.pts > 0)
    .sort((a, b) => b.pts - a.pts);

  if (!atPos.length) return 0;
  const idx = Math.min(slotCount - 1, atPos.length - 1);
  return atPos[idx]?.pts ?? 0;
}

/** Replacement-level projected points per position from the remaining pool. */
export function computeReplacementLevels(
  available: Player[],
  config: DraftConfig,
  rules?: CustomScoringRules,
): ReplacementLevels {
  const limits = getBotRosterLimits(config.rosterPositions ?? DEFAULT_ROSTER_POSITIONS);
  const teams = config.teams;
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;
  const levels = {} as ReplacementLevels;
  for (const pos of positions) {
    const slots = replacementSlotCount(pos, limits, teams);
    levels[pos] = baselineForPosition(available, pos, slots, rules);
  }
  return levels;
}

export function playerVorp(p: Player, levels: ReplacementLevels, rules?: CustomScoringRules): number | null {
  const pos = String(p.pos).toUpperCase();
  const key = pos === 'DEF' ? 'DST' : pos;
  if (!(key in levels)) return null;
  const pts = playerPoints(p, rules);
  if (pts <= 0) return null;
  const baseline = levels[key as keyof ReplacementLevels] ?? 0;
  return pts - baseline;
}

export function formatVorp(vorp: number | null): string {
  if (vorp == null) return '—';
  const sign = vorp >= 0 ? '+' : '';
  return `${sign}${vorp.toFixed(1)}`;
}
