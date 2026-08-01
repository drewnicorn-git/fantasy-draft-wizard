import { canonicalKey, isValidPlayerName, lastNameToken, normalizePos } from './playerKeys';

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

export type DepthChartIndex = Map<string, DepthChartEntry>;

export interface DepthIndexes {
  byKey: DepthChartIndex;
  byTeamPos: Map<string, DepthChartEntry[]>;
}

export function buildDepthChartIndex(entries: DepthChartEntry[]): DepthIndexes {
  const byKey: DepthChartIndex = new Map();
  const byTeamPos = new Map<string, DepthChartEntry[]>();

  for (const raw of entries) {
    const entry: DepthChartEntry = {
      name: raw.name,
      team: normalizeTeam(raw.team),
      pos: normalizePos(raw.pos),
    };

    byKey.set(canonicalKey(entry.name, entry.pos), entry);

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
    list.forEach((entry, index) => {
      entry.depth = index + 1;
    });
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

function rosterDepth(entry: DepthChartEntry, posNorm: string, indexes: DepthIndexes): number | null {
  if (posNorm === 'DST') return 1;
  if (entry.depth != null) return entry.depth;
  const list = indexes.byTeamPos.get(`${entry.team}|${posNorm}`) ?? [];
  const idx = list.indexOf(entry);
  return idx >= 0 ? idx + 1 : null;
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
      depth: rosterDepth(entry, posNorm, indexes),
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

export async function fetchEspnDepthCharts(season: number): Promise<DepthChartEntry[]> {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=50', {
    headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
  });
  if (!res.ok) throw new Error(`ESPN teams: ${res.status}`);
  const json = (await res.json()) as {
    sports?: Array<{ leagues?: Array<{ teams?: Array<{ team: { id: string; abbreviation: string; displayName?: string } }> }> }>;
  };

  const teamList = json.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const entries: DepthChartEntry[] = [];

  for (const { team } of teamList) {
    const teamAbbr = normalizeTeam(team.abbreviation);
    if (!VALID_TEAMS.has(teamAbbr)) continue;

    const rosterRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`, {
      headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
    });
    if (!rosterRes.ok) continue;

    const rosterJson = (await rosterRes.json()) as {
      athletes?: Array<{
        position?: string;
        items?: Array<{
          fullName?: string;
          displayName?: string;
          position?: { abbreviation?: string };
        }>;
      }>;
    };

    for (const group of rosterJson.athletes ?? []) {
      const groupName = (group.position ?? '').toLowerCase();
      if (groupName.includes('injured') || groupName.includes('practice') || groupName.includes('suspended')) continue;

      for (const athlete of group.items ?? []) {
        const athleteName = (athlete.displayName ?? athlete.fullName ?? '').trim();
        if (!isValidPlayerName(athleteName)) continue;
        const mappedPos = mapFantasyPos(athlete.position?.abbreviation, groupName);
        if (!mappedPos || !FANTASY_POS.has(mappedPos)) continue;
        entries.push({ name: athleteName, team: teamAbbr, pos: normalizePos(mappedPos) });
      }
    }

    entries.push({ name: team.displayName ?? `${teamAbbr} D/ST`, team: teamAbbr, pos: 'DST' });
  }

  if (entries.length < 400) {
    throw new Error(`ESPN rosters: too few entries (${entries.length}) for season ${season}`);
  }
  return entries;
}
