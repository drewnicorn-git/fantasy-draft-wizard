import type { DraftConfig, DraftPick, InSeasonState, Player } from '../data/types';
import { getKeepersByTeam } from '../components/KeepersTable';
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

export function createInSeasonStateFromLiveDraft(
  picks: DraftPick[],
  allPlayers: Player[],
  config: DraftConfig,
): InSeasonState {
  return {
    active: true,
    importedAt: new Date().toISOString(),
    config,
    teamNames: loadTeamNames(config.teams),
    rosters: buildRostersFromLiveDraft(picks, allPlayers, config),
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
