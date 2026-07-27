import type { RawPlayerRow } from '../utils.js';

/** NFL.com fantasy rankings — scraped server-side in CI only. */
export async function fetchNfl(season: number): Promise<RawPlayerRow[]> {
  const url = `https://www.nfl.com/fantasy/football/rankings/consensus?type=draft`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`NFL.com: ${res.status}`);
  const html = await res.text();
  return parseNflHtml(html, season);
}

function parseNflHtml(html: string, season: number): RawPlayerRow[] {
  const rows: RawPlayerRow[] = [];

  const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (jsonMatch) {
    try {
      const state = JSON.parse(jsonMatch[1]) as {
        fantasy?: { rankings?: { players?: Array<{ displayName: string; teamAbbr: string; position: string; rank: number }> } };
      };
      const players = state.fantasy?.rankings?.players;
      if (players?.length) {
        return players.map((p) => ({
          name: p.displayName,
          team: p.teamAbbr,
          pos: p.position === 'DEF' ? 'DST' : p.position,
          rank: p.rank,
        }));
      }
    } catch {
      /* fall through to HTML parse */
    }
  }

  const itemRegex =
    /data-rank="(\d+)"[\s\S]*?class="[^"]*player-name[^"]*"[^>]*>([^<]+)<[\s\S]*?class="[^"]*player-team[^"]*"[^>]*>([A-Z]{2,3})<[\s\S]*?class="[^"]*player-pos[^"]*"[^>]*>([A-Z]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(html)) !== null) {
    rows.push({
      name: m[2].trim(),
      team: m[3],
      pos: m[4] === 'DEF' ? 'DST' : m[4],
      rank: Number(m[1]),
    });
  }

  if (rows.length < 30) {
    throw new Error(`NFL.com ${season}: parse failed (${rows.length} rows)`);
  }
  return rows;
}
