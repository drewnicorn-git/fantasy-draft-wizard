import { normalizeName, normalizePos } from '../utils.js';

export interface DepthChartEntry {
  name: string;
  team: string;
  pos: string;
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

function normalizeTeam(abbr: string): string {
  const t = abbr.toUpperCase();
  return ESPN_TEAM_ABBR[t] ?? t;
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

  for (const { team } of teamList) {
    const teamAbbr = normalizeTeam(team.abbreviation);
    if (!VALID_TEAMS.has(teamAbbr)) continue;

    const rosterRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`, {
      headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
      signal: AbortSignal.timeout(20_000),
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
      if (groupName.includes('injured') || groupName.includes('practice') || groupName.includes('suspended')) {
        continue;
      }

      for (const athlete of group.items ?? []) {
        const name = (athlete.displayName ?? athlete.fullName ?? '').trim();
        if (!isValidPlayerName(name)) continue;

        const pos = mapFantasyPos(athlete.position?.abbreviation, groupName);
        if (!pos || !FANTASY_POS.has(pos)) continue;

        entries.push({ name, team: teamAbbr, pos: normalizePos(pos) });
      }
    }

    // Fantasy DST unit keyed to team
    entries.push({
      name: team.displayName ?? `${teamAbbr} D/ST`,
      team: teamAbbr,
      pos: 'DST',
    });
  }

  if (entries.length < 400) {
    throw new Error(`ESPN rosters: too few entries (${entries.length}) for season ${season}`);
  }

  return entries;
}

export type DepthChartIndex = Map<string, DepthChartEntry>;

export function buildDepthChartIndex(entries: DepthChartEntry[]): DepthChartIndex {
  const index: DepthChartIndex = new Map();
  for (const entry of entries) {
    const key = canonicalKey(entry.name, entry.pos);
    if (!index.has(key)) index.set(key, entry);

    // DST aliases: "Baltimore Ravens" vs "Ravens" vs "BAL DST"
    if (entry.pos === 'DST') {
      const short = entry.name.replace(/\s+(D\/ST|DST|Defense)$/i, '').trim();
      if (short) index.set(canonicalKey(short, 'DST'), entry);
    }
  }
  return index;
}

export function resolveTeamFromDepthChart(
  name: string,
  pos: string,
  sourceTeam: string,
  depthIndex: DepthChartIndex,
): { team: string; verified: boolean } | null {
  if (!isValidPlayerName(name)) return null;
  const posNorm = normalizePos(pos);
  if (!FANTASY_POS.has(posNorm)) return null;

  const key = canonicalKey(name, posNorm);
  const official = depthIndex.get(key);

  if (official) {
    return { team: official.team, verified: true };
  }

  // Try without suffix for DST ("Ravens" vs "Baltimore Ravens")
  if (posNorm === 'DST') {
    const alt = depthIndex.get(canonicalKey(name.split(' ').pop() ?? name, 'DST'));
    if (alt) return { team: alt.team, verified: true };
  }

  const src = normalizeTeam(sourceTeam);
  if (VALID_TEAMS.has(src)) {
    return { team: src, verified: false };
  }

  return null;
}
