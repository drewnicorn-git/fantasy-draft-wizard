import type {
  LeagueScoringSettings,
  RosterPositionSettings,
  ScoringFormat,
} from '../data/types';
import { DEFAULT_ROSTER_POSITIONS, DEFAULT_SCORING_SETTINGS } from '../data/types';

export function normalizeReceptionPoints(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SCORING_SETTINGS.receptionPoints;
  return Math.max(0, Math.min(2, Math.round(n * 4) / 4));
}

export function normalizeScoringSettings(raw: Partial<LeagueScoringSettings> | undefined): LeagueScoringSettings {
  return { receptionPoints: normalizeReceptionPoints(raw?.receptionPoints) };
}

export function normalizeRosterPositions(raw: Partial<RosterPositionSettings> | undefined): RosterPositionSettings {
  const clamp = (value: unknown, max: number, fallback: number): number => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(max, Math.round(n)));
  };

  return {
    QB: clamp(raw?.QB, 2, DEFAULT_ROSTER_POSITIONS.QB),
    RB: clamp(raw?.RB, 5, DEFAULT_ROSTER_POSITIONS.RB),
    WR: clamp(raw?.WR, 5, DEFAULT_ROSTER_POSITIONS.WR),
    TE: clamp(raw?.TE, 3, DEFAULT_ROSTER_POSITIONS.TE),
    FLEX: clamp(raw?.FLEX, 3, DEFAULT_ROSTER_POSITIONS.FLEX),
    SUPERFLEX: clamp(raw?.SUPERFLEX, 2, DEFAULT_ROSTER_POSITIONS.SUPERFLEX),
    K: clamp(raw?.K, 2, DEFAULT_ROSTER_POSITIONS.K),
    DST: clamp(raw?.DST, 2, DEFAULT_ROSTER_POSITIONS.DST),
    BENCH: clamp(raw?.BENCH, 10, DEFAULT_ROSTER_POSITIONS.BENCH),
  };
}

export function scoringSettingsFromLegacyFormat(scoring: ScoringFormat): LeagueScoringSettings {
  return { receptionPoints: scoring === 'std' ? 0 : 1 };
}

export function scoringSettingsToLegacyFormat(settings: LeagueScoringSettings): ScoringFormat {
  return settings.receptionPoints >= 0.5 ? 'ppr' : 'std';
}

export function scoringSettingsLabel(settings: LeagueScoringSettings): string {
  if (settings.receptionPoints === 0) return 'Standard';
  if (settings.receptionPoints === 0.5) return 'Half PPR';
  if (settings.receptionPoints === 1) return 'Full PPR';
  return `${settings.receptionPoints} PPR/rec`;
}

export function rosterStarterCount(positions: RosterPositionSettings): number {
  return (
    positions.QB +
    positions.RB +
    positions.WR +
    positions.TE +
    positions.FLEX +
    positions.SUPERFLEX +
    positions.K +
    positions.DST
  );
}

export function rosterTotalSize(positions: RosterPositionSettings): number {
  return rosterStarterCount(positions) + positions.BENCH;
}

export function suggestedDraftRounds(positions: RosterPositionSettings): number {
  return Math.max(15, Math.min(20, rosterTotalSize(positions)));
}

export function rosterPositionsSummary(positions: RosterPositionSettings): string {
  const parts: string[] = [];
  if (positions.QB) parts.push(`${positions.QB} QB`);
  if (positions.RB) parts.push(`${positions.RB} RB`);
  if (positions.WR) parts.push(`${positions.WR} WR`);
  if (positions.TE) parts.push(`${positions.TE} TE`);
  if (positions.FLEX) parts.push(`${positions.FLEX} FLEX`);
  if (positions.SUPERFLEX) parts.push(`${positions.SUPERFLEX} SF`);
  if (positions.K) parts.push(`${positions.K} K`);
  if (positions.DST) parts.push(`${positions.DST} DST`);
  if (positions.BENCH) parts.push(`${positions.BENCH} BN`);
  return parts.join(' · ');
}

export interface BotRosterLimits {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  SUPERFLEX: number;
  K: number;
  DST: number;
  BENCH: number;
  totalStarters: number;
  totalRoster: number;
}

export function getBotRosterLimits(positions: RosterPositionSettings): BotRosterLimits {
  return {
    QB: positions.QB,
    RB: positions.RB,
    WR: positions.WR,
    TE: positions.TE,
    FLEX: positions.FLEX,
    SUPERFLEX: positions.SUPERFLEX,
    K: positions.K,
    DST: positions.DST,
    BENCH: positions.BENCH,
    totalStarters: rosterStarterCount(positions),
    totalRoster: rosterTotalSize(positions),
  };
}

export const SCORING_PRESETS: { label: string; settings: LeagueScoringSettings }[] = [
  { label: 'Standard', settings: { receptionPoints: 0 } },
  { label: 'Half PPR', settings: { receptionPoints: 0.5 } },
  { label: 'Full PPR', settings: { receptionPoints: 1 } },
];

export const ROSTER_PRESETS: { label: string; positions: RosterPositionSettings }[] = [
  {
    label: 'Standard',
    positions: { ...DEFAULT_ROSTER_POSITIONS },
  },
  {
    label: '2 FLEX',
    positions: { ...DEFAULT_ROSTER_POSITIONS, FLEX: 2 },
  },
  {
    label: 'Superflex',
    positions: { ...DEFAULT_ROSTER_POSITIONS, SUPERFLEX: 1, BENCH: 5 },
  },
  {
    label: 'No K/DST',
    positions: { ...DEFAULT_ROSTER_POSITIONS, K: 0, DST: 0, BENCH: 8 },
  },
];
