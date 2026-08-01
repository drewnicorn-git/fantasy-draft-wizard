import { normalizeName, normalizePos, lastNameToken } from '../utils.js';

export interface DepthChartEntry {
  name: string;
  team: string;
  pos: string;
  depth?: number;
}

const ESPN_TEAM_ABBR: Record<string, string> = {
  ARZ: 'ARI',
  WSH: 'WAS',
  JAX: 'JAC',
};

export const VALID_TEAMS = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
  'HOU', 'IND', 'JAC', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
]);

const FANTASY_POS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);

export function normalizeTeam(abbr: string): string {
  const t = abbr.toUpperCase();
  return ESPN_TEAM_ABBR[t] ?? t;
}

export function dstTeamKey(team: string): string {
  return `${normalizeTeam(team)}|DST`;
}

function mapFantasyPos(abbrev?: string, group?: string): string | null {
  const ab = (abbrev ?? '').toUpperCase();
  if (ab === 'QB') return 'QB';
  if (ab === 'RB' || ab === 'FB') return 'RB';
  if (ab === 'WR') return 'WR';
  if (ab === 'TE') return 'TE';
  if (ab === 'K' || ab === 'PK') return 'K';
  if (group === 'defense' && (ab === 'DST' || ab === 'DEF' || ab === 'D')) return 'DST';
  return null;
}

export function isValidPlayerName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  if (/^depth player\b/i.test(n)) return false;
  if (/^(test|unknown|n\/a|tbd)$/i.test(n)) return false;
  return true;
}

export function canonicalKey(name: string, pos: string): string {
  return `${normalizeName(name)}|${normalizePos(pos)}`;
}

export type DepthChartIndex = Map<string, DepthChartEntry>;

export interface DepthIndexes {
  byKey: DepthChartIndex;
  byTeamPos: Map<string, DepthChartEntry[]>;
}

function isOffensiveDepthChart(chart: { name?: string; positions?: Record<string, unknown> }): boolean {
  const positions = chart.positions ?? {};
  if (positions.qb || positions.wr1 || positions.rb) return true;
  const name = (chart.name ?? '').toLowerCase();
  return /\dwr|\dte/.test(name) || name.includes('offense');
}

export function buildDepthChartIndex(entries: DepthChartEntry[]): DepthIndexes {
  const byKey: DepthChartIndex = new Map();
  const byTeamPos = new Map<string, DepthChartEntry[]>();

  for (const raw of entries) {
    const entry: DepthChartEntry = {
      name: raw.name,
      team: normalizeTeam(raw.team),
      pos: normalizePos(raw.pos),
      depth: raw.depth,
    };

    const key = canonicalKey(entry.name, entry.pos);
    const existing = byKey.get(key);
    if (existing) {
      if (entry.depth != null) {
        existing.depth =
          existing.depth == null ? entry.depth : Math.min(existing.depth, entry.depth);
      }
    } else {
      byKey.set(key, entry);
    }

    if (entry.pos === 'DST') {
      byKey.set(dstTeamKey(entry.team), entry);
      const short = entry.name.replace(/\s+(D\/ST|DST|Defense)$/i, '').trim();
      if (short) byKey.set(canonicalKey(short, 'DST'), entry);
    }

    const teamPosKey = `${entry.team}|${entry.pos}`;
    if (!byTeamPos.has(teamPosKey)) byTeamPos.set(teamPosKey, []);
    byTeamPos.get(teamPosKey)!.push(entry);
  }

  for (const list of byTeamPos.values()) {
    for (const entry of list) {
      if (entry.pos === 'DST' && entry.depth == null) entry.depth = 1;
    }
  }

  return { byKey, byTeamPos };
}

export interface PlayerIdentity {
  id: string;
  team: string;
  verified: boolean;
  displayName: string;
  depth: number | null;
}

function rosterDepth(entry: DepthChartEntry, posNorm: string): number | null {
  if (posNorm === 'DST') return entry.depth ?? 1;
  return entry.depth ?? null;
}

export function resolvePlayerIdentity(
  name: string,
  pos: string,
  sourceTeam: string,
  indexes: DepthIndexes,
): PlayerIdentity | null {
  if (!isValidPlayerName(name)) return null;
  const posNorm = normalizePos(pos);
  if (!FANTASY_POS.has(posNorm)) return null;
  const team = normalizeTeam(sourceTeam);

  if (posNorm === 'DST') {
    if (!VALID_TEAMS.has(team)) return null;
    const entry = indexes.byKey.get(dstTeamKey(team));
    return {
      id: dstTeamKey(team),
      team,
      verified: !!entry,
      displayName: entry?.name ?? name.trim(),
      depth: entry ? 1 : null,
    };
  }

  let entry = indexes.byKey.get(canonicalKey(name, posNorm));
  if (!entry && VALID_TEAMS.has(team)) {
    const last = lastNameToken(name);
    const candidates = indexes.byTeamPos.get(`${team}|${posNorm}`) ?? [];
    entry = candidates.find((c) => lastNameToken(c.name) === last);
  }

  if (entry) {
    return {
      id: canonicalKey(entry.name, posNorm),
      team: entry.team,
      verified: true,
      displayName: entry.name,
      depth: rosterDepth(entry, posNorm),
    };
  }

  if (VALID_TEAMS.has(team)) {
    return {
      id: canonicalKey(name, posNorm),
      team,
      verified: false,
      displayName: name.trim(),
      depth: null,
    };
  }

  return null;
}

/** @deprecated Use resolvePlayerIdentity */
export function resolveTeamFromDepthChart(
  name: string,
  pos: string,
  sourceTeam: string,
  depthIndex: DepthChartIndex,
): { team: string; verified: boolean } | null {
  const identity = resolvePlayerIdentity(name, pos, sourceTeam, { byKey: depthIndex, byTeamPos: new Map() });
  if (!identity) return null;
  return { team: identity.team, verified: identity.verified };
}

function depthEntryKey(entry: Pick<DepthChartEntry, 'name' | 'team' | 'pos'>): string {
  return `${normalizeTeam(entry.team)}|${normalizePos(entry.pos)}|${canonicalKey(entry.name, entry.pos)}`;
}

type EspnDepthAthlete = { displayName?: string; fullName?: string };

function athleteName(a: EspnDepthAthlete): string {
  return (a.displayName ?? a.fullName ?? '').trim();
}

function parseOffensiveDepthChart(
  positions: Record<string, { athletes?: EspnDepthAthlete[] }>,
  teamAbbr: string,
): DepthChartEntry[] {
  const entries: DepthChartEntry[] = [];

  const pushAthletes = (posKey: string, pos: string): void => {
    for (const [idx, athlete] of (positions[posKey]?.athletes ?? []).entries()) {
      const name = athleteName(athlete);
      if (!isValidPlayerName(name)) continue;
      entries.push({ name, team: teamAbbr, pos, depth: idx + 1 });
    }
  };

  pushAthletes('qb', 'QB');
  pushAthletes('rb', 'RB');
  pushAthletes('te', 'TE');
  pushAthletes('pk', 'K');
  pushAthletes('k', 'K');

  const wrSlots = ['wr1', 'wr2', 'wr3'] as const;
  const seenWr = new Set<string>();
  let wrDepth = 1;

  for (const slot of wrSlots) {
    const starter = positions[slot]?.athletes?.[0];
    if (!starter) continue;
    const name = athleteName(starter);
    if (!isValidPlayerName(name) || seenWr.has(name)) continue;
    seenWr.add(name);
    entries.push({ name, team: teamAbbr, pos: 'WR', depth: wrDepth++ });
  }

  for (const slot of wrSlots) {
    for (const athlete of (positions[slot]?.athletes ?? []).slice(1)) {
      const name = athleteName(athlete);
      if (!isValidPlayerName(name) || seenWr.has(name)) continue;
      seenWr.add(name);
      entries.push({ name, team: teamAbbr, pos: 'WR', depth: wrDepth++ });
    }
  }

  return entries;
}

function parseRosterEntries(
  rosterJson: {
    athletes?: Array<{
      position?: string;
      items?: Array<{
        fullName?: string;
        displayName?: string;
        position?: { abbreviation?: string };
      }>;
    }>;
  },
  teamAbbr: string,
  teamDisplayName?: string,
): DepthChartEntry[] {
  const entries: DepthChartEntry[] = [];

  for (const group of rosterJson.athletes ?? []) {
    const groupName = (group.position ?? '').toLowerCase();
    if (groupName.includes('injured') || groupName.includes('practice') || groupName.includes('suspended')) {
      continue;
    }

    for (const athlete of group.items ?? []) {
      const name = (athlete.displayName ?? athlete.fullName ?? '').trim();
      if (!isValidPlayerName(name)) continue;

      const mappedPos = mapFantasyPos(athlete.position?.abbreviation, groupName);
      if (!mappedPos || !FANTASY_POS.has(mappedPos)) continue;

      entries.push({ name, team: teamAbbr, pos: normalizePos(mappedPos) });
    }
  }

  entries.push({
    name: teamDisplayName ?? `${teamAbbr} D/ST`,
    team: teamAbbr,
    pos: 'DST',
    depth: 1,
  });

  return entries;
}

export async function fetchEspnDepthCharts(season: number): Promise<DepthChartEntry[]> {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=50', {
    headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ESPN teams: ${res.status}`);
  const json = (await res.json()) as {
    sports?: Array<{ leagues?: Array<{ teams?: Array<{ team: { id: string; abbreviation: string; displayName?: string } }> }> }>;
  };

  const teamList = json.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const entries: DepthChartEntry[] = [];
  const depthByKey = new Map<string, number>();

  for (const { team } of teamList) {
    const teamAbbr = normalizeTeam(team.abbreviation);
    if (!VALID_TEAMS.has(teamAbbr)) continue;

    const headers = { 'User-Agent': 'fantasy-draft-wizard (github.com)' };

    const [rosterRes, depthRes] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      }),
      fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/depthcharts`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      }),
    ]);

    if (rosterRes.ok) {
      const rosterJson = (await rosterRes.json()) as Parameters<typeof parseRosterEntries>[0];
      entries.push(...parseRosterEntries(rosterJson, teamAbbr, team.displayName));
    }

    if (!depthRes.ok) continue;

    const depthJson = (await depthRes.json()) as {
      depthchart?: Array<{ name?: string; positions?: Record<string, { athletes?: EspnDepthAthlete[] }> }>;
    };

    for (const chart of depthJson.depthchart ?? []) {
      if (!isOffensiveDepthChart(chart)) continue;

      for (const depthEntry of parseOffensiveDepthChart(chart.positions ?? {}, teamAbbr)) {
        if (depthEntry.depth != null) depthByKey.set(depthEntryKey(depthEntry), depthEntry.depth);
      }
    }
  }

  for (const entry of entries) {
    const depth = depthByKey.get(depthEntryKey(entry));
    if (depth != null) entry.depth = depth;
  }

  if (entries.length < 400) {
    throw new Error(`ESPN rosters: too few entries (${entries.length}) for season ${season}`);
  }

  const withDepth = entries.filter((e) => e.depth != null).length;
  console.log(`  ESPN depth charts applied to ${withDepth}/${entries.length} roster entries`);

  return entries;
}
