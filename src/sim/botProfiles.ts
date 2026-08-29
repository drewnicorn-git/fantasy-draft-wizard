import type { BotArchetype, BotPersonality, BotProfile } from '../data/types';

export const BOT_ARCHETYPE_LABELS: Record<BotArchetype, string> = {
  sharp: 'Sharp ADP',
  balanced: 'Balanced',
  'zero-rb': 'Zero RB',
  'hero-rb': 'Hero RB',
  'early-qb': 'Early QB',
  'early-te': 'Early TE',
  reachy: 'Reachy',
  homer: 'Homer',
};

export const BOT_ARCHETYPES: BotArchetype[] = [
  'sharp',
  'balanced',
  'zero-rb',
  'hero-rb',
  'early-qb',
  'early-te',
  'reachy',
  'homer',
];

const ARCHETYPE_DEFAULTS: Record<
  BotArchetype,
  Pick<BotProfile, 'reachFactor' | 'adpAdherence' | 'qbTargetRound' | 'homerTeams'>
> = {
  sharp: { reachFactor: 0.75, adpAdherence: 1.35 },
  balanced: { reachFactor: 1, adpAdherence: 1 },
  'zero-rb': { reachFactor: 1, adpAdherence: 0.95 },
  'hero-rb': { reachFactor: 1, adpAdherence: 0.95 },
  'early-qb': { reachFactor: 1.05, adpAdherence: 0.9, qbTargetRound: 2 },
  'early-te': { reachFactor: 1.05, adpAdherence: 0.9 },
  reachy: { reachFactor: 1.35, adpAdherence: 0.75 },
  homer: { reachFactor: 1.1, adpAdherence: 0.85, homerTeams: [] },
};

/** Rotate archetypes so the mock room is not uniform. */
const DEFAULT_ROTATION: BotArchetype[] = [
  'sharp',
  'balanced',
  'early-qb',
  'zero-rb',
  'reachy',
  'hero-rb',
  'balanced',
  'early-te',
  'sharp',
  'homer',
  'balanced',
  'reachy',
  'zero-rb',
  'sharp',
];

export function createBotProfile(teamIndex: number, archetype: BotArchetype = 'balanced'): BotProfile {
  const defaults = ARCHETYPE_DEFAULTS[archetype];
  return {
    teamIndex,
    archetype,
    reachFactor: defaults.reachFactor,
    adpAdherence: defaults.adpAdherence,
    qbTargetRound: defaults.qbTargetRound,
    homerTeams: defaults.homerTeams ? [...defaults.homerTeams] : undefined,
  };
}

export function defaultBotProfiles(teams: number, userSlot: number): BotProfile[] {
  const profiles: BotProfile[] = [];
  let rot = 0;
  for (let t = 0; t < teams; t++) {
    if (t === userSlot - 1) continue;
    const archetype = DEFAULT_ROTATION[rot % DEFAULT_ROTATION.length];
    rot++;
    profiles.push(createBotProfile(t, archetype));
  }
  return profiles;
}

export function normalizeBotProfiles(
  raw: BotProfile[] | undefined,
  teams: number,
  userSlot: number,
): BotProfile[] {
  const defaults = defaultBotProfiles(teams, userSlot);
  if (!raw?.length) return defaults;

  const byTeam = new Map<number, BotProfile>();
  for (const p of raw) {
    if (p.teamIndex >= 0 && p.teamIndex < teams && p.teamIndex !== userSlot - 1) {
      byTeam.set(p.teamIndex, { ...createBotProfile(p.teamIndex, p.archetype), ...p, teamIndex: p.teamIndex });
    }
  }

  return defaults.map((d) => byTeam.get(d.teamIndex) ?? d);
}

export function getBotProfileForTeam(profiles: BotProfile[], teamIndex: number): BotProfile {
  return profiles.find((p) => p.teamIndex === teamIndex) ?? createBotProfile(teamIndex, 'balanced');
}

/** Map archetype to legacy roster-need personality hook. */
export function archetypeToPersonality(archetype: BotArchetype): BotPersonality {
  if (archetype === 'zero-rb') return 'zero-rb';
  if (archetype === 'hero-rb') return 'hero-rb';
  return 'balanced';
}
