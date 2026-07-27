import type { RawPlayerRow } from '../utils.js';

/** Yahoo expert rankings page — scraped server-side in CI only. */
export async function fetchYahoo(season: number, scoring: 'STD' | 'PPR'): Promise<RawPlayerRow[]> {
  const format = scoring === 'PPR' ? 'ppr' : 'standard';
  const url = `https://football.fantasysports.yahoo.com/f1/draftanalysis?tab=DA&pos=ALL&sort=OR_${format === 'ppr' ? 'PPR' : 'STD'}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Yahoo ${scoring}: ${res.status}`);
  const html = await res.text();
  return parseYahooHtml(html);
}

function parseYahooHtml(html: string): RawPlayerRow[] {
  const rows: RawPlayerRow[] = [];
  const rowRegex =
    /<tr[^>]*data-player-id="(\d+)"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<span class="ysf-player-detail-team">([A-Z]{2,3})<\/span>[\s\S]*?<span class="ysf-player-detail-pos">([A-Z/]+)<\/span>[\s\S]*?<td[^>]*>(\d+)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(html)) !== null) {
    const [, , name, team, posRaw, rankStr] = m;
    const pos = posRaw.split('/')[0].toUpperCase();
    rows.push({
      name: decodeHtml(name.trim()),
      team,
      pos: pos === 'DEF' ? 'DST' : pos,
      rank: Number(rankStr),
    });
  }

  if (rows.length < 50) {
    return parseYahooFallback(html);
  }
  return rows;
}

function parseYahooFallback(html: string): RawPlayerRow[] {
  const rows: RawPlayerRow[] = [];
  const blocks = html.split('ysf-player-name');
  for (const block of blocks.slice(1, 400)) {
    const nameMatch = block.match(/>([^<]{3,40})</);
    const teamMatch = block.match(/([A-Z]{2,3})\s*-\s*(QB|RB|WR|TE|K|DEF)/);
    const rankMatch = block.match(/rank[^0-9]*(\d{1,3})/i);
    if (nameMatch && teamMatch) {
      rows.push({
        name: decodeHtml(nameMatch[1].trim()),
        team: teamMatch[1],
        pos: teamMatch[2] === 'DEF' ? 'DST' : teamMatch[2],
        rank: rankMatch ? Number(rankMatch[1]) : rows.length + 1,
      });
    }
  }
  if (rows.length < 30) throw new Error(`Yahoo: parse failed (${rows.length} rows)`);
  return rows;
}

function decodeHtml(s: string): string {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
}
