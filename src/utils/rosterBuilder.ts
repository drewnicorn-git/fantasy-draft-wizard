import type { DraftConfig, DraftPick, InSeasonState, Player } from '../data/types';
import { getKeepersByTeam } from '../components/KeepersTable';
import { getTeamDisplayName } from '../components/TeamNamesEditor';
import { loadKeepers, loadTeamNames, saveInSeasonState } from './storage';

export interface InSeasonHandoffSummary {
  ready: boolean;
  draftPicks: number;
  draftTarget: number;
  keeperCount: number;
  myTeamIndex: number;
  myTeamKeepers: number;
  myTeamDraftPicks: number;
  myTeamRosterSize: number;
  message: string;
}

export function getLiveDraftPickTarget(config: DraftConfig): number {
  return config.teams * config.rounds;
}

export function getInSeasonHandoffSummary(
  picks: DraftPick[],
  allPlayers: Player[],
  config: DraftConfig,
): InSeasonHandoffSummary {
  const draftTarget = getLiveDraftPickTarget(config);
  const draftPicks = picks.length;
  const keeperCount = loadKeepers().size;
  const myTeamIndex = config.slot - 1;
  const keepersByTeam = getKeepersByTeam(allPlayers);
  const myTeamKeepers = keepersByTeam.get(myTeamIndex)?.length ?? 0;
  const myTeamDraftPicks = picks.filter((p) => p.teamIndex === myTeamIndex).length;
  const myTeamRosterSize = myTeamKeepers + myTeamDraftPicks;
  const rosters = buildRostersFromLiveDraft(picks, allPlayers, config);

  if (draftPicks < draftTarget) {
    const remaining = draftTarget - draftPicks;
    return {
      ready: false,
      draftPicks,
      draftTarget,
      keeperCount,
      myTeamIndex,
      myTeamKeepers,
      myTeamDraftPicks,
      myTeamRosterSize,
      message: `Live draft incomplete: ${draftPicks} of ${draftTarget} picks recorded (${remaining} remaining). Finish the draft first — ${keeperCount} keeper${keeperCount === 1 ? '' : 's'} will be included automatically.`,
    };
  }

  const emptyTeams = Object.entries(rosters)
    .filter(([, ids]) => ids.length === 0)
    .map(([team]) => getTeamDisplayName(Number(team)));
  if (emptyTeams.length) {
    return {
      ready: false,
      draftPicks,
      draftTarget,
      keeperCount,
      myTeamIndex,
      myTeamKeepers,
      myTeamDraftPicks,
      myTeamRosterSize,
      message: `Cannot import: ${emptyTeams.join(', ')} ${emptyTeams.length === 1 ? 'has' : 'have'} no players (check keeper team assignments).`,
    };
  }

  return {
    ready: true,
    draftPicks,
    draftTarget,
    keeperCount,
    myTeamIndex,
    myTeamKeepers,
    myTeamDraftPicks,
    myTeamRosterSize,
    message: `Import ${config.teams} teams to in-season? Your roster: ${myTeamKeepers} keeper${myTeamKeepers === 1 ? '' : 's'} + ${myTeamDraftPicks} draft picks (${myTeamRosterSize} players). League total: ${keeperCount} keeper${keeperCount === 1 ? '' : 's'} + ${draftPicks} draft picks.`,
  };
}

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
): boolean {
  const summary = getInSeasonHandoffSummary(picks, allPlayers, config);
  if (!summary.ready) {
    alert(summary.message);
    return false;
  }
  if (!confirm(summary.message)) return false;
  saveInSeasonState(createInSeasonStateFromLiveDraft(picks, allPlayers, config));
  return true;
}
