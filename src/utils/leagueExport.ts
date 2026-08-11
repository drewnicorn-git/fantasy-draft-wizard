import type { LeagueProfile, LeaguesStore } from '../data/types';
import { LEAGUES_STORE_VERSION } from '../state/leaguesStore';

export const LEAGUE_EXPORT_FORMAT = 'fdw-league' as const;
export const LEAGUES_STORE_EXPORT_FORMAT = 'fdw-leagues-store' as const;
export const LEAGUE_EXPORT_VERSION = 1;

export interface LeagueExportFile {
  format: typeof LEAGUE_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  league: LeagueProfile;
}

export interface LeaguesStoreExportFile {
  format: typeof LEAGUES_STORE_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  store: LeaguesStore;
}

export function buildLeagueExportFile(league: LeagueProfile): LeagueExportFile {
  return {
    format: LEAGUE_EXPORT_FORMAT,
    version: LEAGUE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    league: structuredClone(league),
  };
}

export function buildLeaguesStoreExportFile(store: LeaguesStore): LeaguesStoreExportFile {
  return {
    format: LEAGUES_STORE_EXPORT_FORMAT,
    version: LEAGUE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    store: structuredClone(store),
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function parseLeagueImportPayload(raw: unknown): LeagueProfile {
  if (!isRecord(raw)) throw new Error('Invalid league file: expected a JSON object');

  let league: unknown = raw;
  if (raw.format === LEAGUE_EXPORT_FORMAT) {
    if (!isRecord(raw.league)) throw new Error('Invalid league export: missing league object');
    league = raw.league;
  }

  if (!isRecord(league)) throw new Error('Invalid league file: missing league data');
  if (typeof league.name !== 'string' || !league.name.trim()) {
    throw new Error('Invalid league file: league name is required');
  }
  if (!isRecord(league.draftConfig)) throw new Error('Invalid league file: draftConfig is required');

  return league as unknown as LeagueProfile;
}

export function parseLeaguesStoreImportPayload(raw: unknown): LeaguesStore {
  if (!isRecord(raw)) throw new Error('Invalid backup file: expected a JSON object');

  if (raw.format === LEAGUES_STORE_EXPORT_FORMAT) {
    if (!isRecord(raw.store)) throw new Error('Invalid backup: missing store object');
    return raw.store as unknown as LeaguesStore;
  }

  if (isRecord(raw.leagues) && typeof raw.activeLeagueId === 'string') {
    return raw as unknown as LeaguesStore;
  }

  throw new Error('Unrecognized backup format');
}

export function sanitizeImportedStore(store: LeaguesStore): LeaguesStore {
  return {
    version: LEAGUES_STORE_VERSION,
    activeLeagueId: store.activeLeagueId,
    leagues: { ...store.leagues },
    updatedAt: store.updatedAt,
  };
}
