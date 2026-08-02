import type { RawPlayerRow, ScoringKey } from '../utils.js';
import { normalizePos } from '../utils.js';

const SCORING_PATH: Record<ScoringKey, string> = {
  STD: 'standard',
  PPR: 'ppr',
};

function mapPosition(pos: string): string {
  const p = pos.toUpperCase();
  if (p === 'PK') return 'K';
  return normalizePos(p);
}

/** Fantasy Football Calculator ADP — free JSON API (attribution requested by provider). */
export async function fetchFfcAdp(season: number, scoring: ScoringKey, teams = 12): Promise<RawPlayerRow[]> {
  const format = SCORING_PATH[scoring];
  const url = `https://fantasyfootballcalculator.com/api/v1/adp/${format}?position=all&teams=${teams}&year=${season}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'fantasy-draft-wizard (github.com)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`FFC ${scoring}: ${res.status}`);

  const json = (await res.json()) as {
    status?: string;
    players?: Array<{
      name: string;
      team: string;
      position: string;
      adp: number;
      bye?: number | null;
    }>;
  };

  const players = json.players ?? [];
  if (json.status !== 'Success' || players.length < 100) {
    throw new Error(`FFC ${scoring}: too few players (${players.length})`);
  }

  const sorted = [...players].sort((a, b) => a.adp - b.adp);
  return sorted.map((p, idx) => ({
    name: p.name.trim(),
    team: (p.team || 'FA').toUpperCase(),
    pos: mapPosition(p.position),
    adp: p.adp,
    rank: idx + 1,
    bye: p.bye ?? null,
  }));
}
