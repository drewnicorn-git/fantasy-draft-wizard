import { canonicalKey } from './espn-depth.js';
import { normalizePos } from '../utils.js';

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const EXCLUDED_STATUSES = new Set(['Active']);

export interface EspnInjuryRecord {
  name: string;
  team: string;
  pos: string;
  status: string;
  summary: string;
  updatedAt: string;
}

export interface InjuryReportEntry {
  playerId: string;
  name: string;
  team: string;
  pos: string;
  status: string;
  summary: string;
  updatedAt: string;
}

export interface InjuriesData {
  season: number;
  builtAt: string;
  fetchedAt: string | null;
  entries: InjuryReportEntry[];
}

const STATUS_SORT: Record<string, number> = {
  Out: 0,
  Doubtful: 1,
  Questionable: 2,
  'Injured Reserve': 3,
  Suspension: 4,
};

interface RankedPlayer {
  id: string;
  name: string;
  team: string;
  pos: string;
}

export async function fetchEspnInjuries(): Promise<EspnInjuryRecord[]> {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries', {
    headers: { 'User-Agent': 'fantasy-draft-wizard (github.com)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ESPN injuries: ${res.status}`);

  const json = (await res.json()) as {
    injuries?: Array<{
      displayName?: string;
      team?: { abbreviation?: string };
      injuries?: Array<{
        status?: string;
        shortComment?: string;
        longComment?: string;
        date?: string;
        athlete?: {
          displayName?: string;
          position?: { abbreviation?: string };
        };
      }>;
    }>;
  };

  const records: EspnInjuryRecord[] = [];

  for (const teamBlock of json.injuries ?? []) {
    const teamAbbr = (teamBlock.team?.abbreviation ?? '').toUpperCase();
    for (const inj of teamBlock.injuries ?? []) {
      const status = inj.status?.trim();
      if (!status || EXCLUDED_STATUSES.has(status)) continue;

      const rawPos = inj.athlete?.position?.abbreviation ?? '';
      const pos = normalizePos(rawPos === 'DEF' ? 'DST' : rawPos);
      if (!SKILL_POSITIONS.has(pos)) continue;

      const name = (inj.athlete?.displayName ?? '').trim();
      if (!name) continue;

      const summary = (inj.shortComment ?? inj.longComment ?? '').trim();
      if (!summary) continue;

      records.push({
        name,
        team: teamAbbr,
        pos,
        status,
        summary,
        updatedAt: inj.date ?? new Date().toISOString(),
      });
    }
  }

  return records;
}

export function buildInjuryReport(
  season: number,
  rankedPlayers: RankedPlayer[],
  rawInjuries: EspnInjuryRecord[],
  fetchedAt: string | null,
): InjuriesData {
  const rankedByKey = new Map<string, RankedPlayer>();
  for (const player of rankedPlayers) {
    rankedByKey.set(canonicalKey(player.name, player.pos), player);
  }

  const entries: InjuryReportEntry[] = [];
  const seen = new Set<string>();

  for (const inj of rawInjuries) {
    const player = rankedByKey.get(canonicalKey(inj.name, inj.pos));
    if (!player || seen.has(player.id)) continue;
    seen.add(player.id);

    entries.push({
      playerId: player.id,
      name: player.name,
      team: player.team,
      pos: player.pos,
      status: inj.status,
      summary: inj.summary,
      updatedAt: inj.updatedAt,
    });
  }

  entries.sort((a, b) => {
    const sa = STATUS_SORT[a.status] ?? 99;
    const sb = STATUS_SORT[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });

  return {
    season,
    builtAt: new Date().toISOString(),
    fetchedAt,
    entries,
  };
}
