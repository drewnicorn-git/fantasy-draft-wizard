import type { LeagueProfile, LeaguesStore } from '../data/types';

/** True when local storage is still the factory single-league default (no user work yet). */
export function isPristineDefaultStore(store: LeaguesStore): boolean {
  const leagues = Object.values(store.leagues);
  if (leagues.length !== 1) return false;

  const league = leagues[0];
  if (league.name !== 'My league') return false;
  if (league.liveDraft?.picks?.length) return false;
  if (league.mockDraft?.picks?.length) return false;
  if (league.inSeason?.active) return false;
  if (Object.keys(league.playerTags).length > 0) return false;
  if (Object.keys(league.manualRanks?.std ?? {}).length > 0) return false;
  if (Object.keys(league.manualRanks?.ppr ?? {}).length > 0) return false;
  if (league.keepers.length > 0) return false;
  if (league.teamNames.some((n) => n.trim().length > 0)) return false;
  if (league.customTagDefinitions.length > 0) return false;
  return true;
}

export function leagueCount(store: LeaguesStore): number {
  return Object.keys(store.leagues).length;
}

function pickNewerLeague(a: LeagueProfile, b: LeagueProfile): LeagueProfile {
  const aTs = Date.parse(a.updatedAt) || 0;
  const bTs = Date.parse(b.updatedAt) || 0;
  return aTs >= bTs ? a : b;
}

/** Union leagues by id; when both sides have the same id, keep the newer updatedAt. */
export function mergeLeaguesStores(local: LeaguesStore, remote: LeaguesStore): LeaguesStore {
  if (isPristineDefaultStore(local)) {
    return { ...remote, leagues: { ...remote.leagues } };
  }

  const mergedLeagues: Record<string, LeagueProfile> = { ...remote.leagues };

  for (const [id, league] of Object.entries(local.leagues)) {
    const existing = mergedLeagues[id];
    mergedLeagues[id] = existing ? pickNewerLeague(league, existing) : league;
  }

  const activeLeagueId =
    mergedLeagues[local.activeLeagueId]
      ? local.activeLeagueId
      : mergedLeagues[remote.activeLeagueId]
        ? remote.activeLeagueId
        : Object.keys(mergedLeagues)[0];

  const leagueTimes = Object.values(mergedLeagues).map((l) => Date.parse(l.updatedAt) || 0);
  const updatedAt = leagueTimes.length
    ? new Date(Math.max(...leagueTimes)).toISOString()
    : new Date().toISOString();

  return {
    version: local.version,
    activeLeagueId,
    leagues: mergedLeagues,
    updatedAt,
  };
}

export function storesEqual(a: LeaguesStore, b: LeaguesStore): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
