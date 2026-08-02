import type { DraftConfig, DraftPick, InSeasonState, Player } from '../data/types';
import { getKeepersByTeam } from '../components/KeepersTable';
import { getTeamDisplayName } from '../components/TeamNamesEditor';
import { loadTeamNames, saveInSeasonState } from './storage';

export function buildRostersFromLiveDraft(
  picks: DraftPick[],
  allPlayers: Player[],
  config: DraftConfig,
): Record<number, string[]> {
  const rosters: Record<number, string[]> = {};
  for (let i = 0; i < config.teams; i++) rosters[i] = [];

  for (const [teamIndex, players] of getKeepersByTeam(allPlayers)) {
    for (const p of players) {
      if (!rosters[teamIndex].includes(p.id)) rosters[teamIndex].push(p.id);
    }
  }

  for (const pick of picks) {
    if (!rosters[pick.teamIndex].includes(pick.playerId)) {
      rosters[pick.teamIndex].push(pick.playerId);
    }
  }

  return rosters;
}

function buildRosterLimits(rosters: Record<number, string[]>, teams: number): Record<number, number> {
  const limits: Record<number, number> = {};
  for (let i = 0; i < teams; i++) {
    limits[i] = rosters[i]?.length ?? 0;
  }
  return limits;
}

export function ensureRosterLimits(state: InSeasonState): InSeasonState {
  if (state.rosterLimits) return state;
  return {
    ...state,
    rosterLimits: buildRosterLimits(state.rosters, state.config.teams),
  };
}

export function getRosterLimit(state: InSeasonState, teamIndex: number): number {
  return state.rosterLimits[teamIndex] ?? state.rosters[teamIndex]?.length ?? 0;
}

export function getRosterCount(state: InSeasonState, teamIndex: number): number {
  return state.rosters[teamIndex]?.length ?? 0;
}

export function isRosterFull(state: InSeasonState, teamIndex: number): boolean {
  return getRosterCount(state, teamIndex) >= getRosterLimit(state, teamIndex);
}

export function createInSeasonStateFromLiveDraft(
  picks: DraftPick[],
  allPlayers: Player[],
  config: DraftConfig,
): InSeasonState {
  const rosters = buildRostersFromLiveDraft(picks, allPlayers, config);
  return {
    active: true,
    importedAt: new Date().toISOString(),
    config,
    teamNames: loadTeamNames(config.teams),
    rosters,
    rosterLimits: buildRosterLimits(rosters, config.teams),
    myTeamIndex: config.slot - 1,
  };
}

export function getAllOwnedPlayerIds(rosters: Record<number, string[]>): Set<string> {
  const ids = new Set<string>();
  for (const roster of Object.values(rosters)) {
    for (const id of roster) ids.add(id);
  }
  return ids;
}

export function resolveRosterPlayers(rosterIds: string[], allPlayers: Player[]): Player[] {
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  return rosterIds.map((id) => byId.get(id)).filter((p): p is Player => !!p);
}

export function dropPlayerFromTeam(state: InSeasonState, teamIndex: number, playerId: string): InSeasonState {
  const rosters = { ...state.rosters };
  rosters[teamIndex] = (rosters[teamIndex] ?? []).filter((id) => id !== playerId);
  return { ...state, rosters };
}

export function addPlayerToTeam(state: InSeasonState, teamIndex: number, playerId: string): InSeasonState {
  const rosters = { ...state.rosters };
  for (const key of Object.keys(rosters)) {
    rosters[Number(key)] = rosters[Number(key)].filter((id) => id !== playerId);
  }
  rosters[teamIndex] = [...(rosters[teamIndex] ?? []), playerId];
  return { ...state, rosters };
}

export function tryAddPlayerToTeam(
  state: InSeasonState,
  teamIndex: number,
  playerId: string,
): { state: InSeasonState; error?: string } {
  const normalized = ensureRosterLimits(state);
  if (isRosterFull(normalized, teamIndex)) {
    const limit = getRosterLimit(normalized, teamIndex);
    return {
      state: normalized,
      error: `${getTeamDisplayName(teamIndex)} is full (${limit} players). Drop a player before adding another.`,
    };
  }
  return { state: addPlayerToTeam(normalized, teamIndex, playerId) };
}

export function moveLiveDraftToInSeason(
  picks: DraftPick[],
  allPlayers: Player[],
  config: DraftConfig,
  expectedPicks: number,
): boolean {
  if (picks.length < expectedPicks) {
    alert('Finish the live draft before moving to in-season management.');
    return false;
  }
  saveInSeasonState(createInSeasonStateFromLiveDraft(picks, allPlayers, config));
  return true;
}
