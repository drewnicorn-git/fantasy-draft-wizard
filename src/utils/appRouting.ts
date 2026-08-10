export type AppTabId = 'rankings' | 'mock' | 'live' | 'injuries' | 'inseason' | 'depth';

const TAB_IDS: AppTabId[] = ['rankings', 'mock', 'live', 'injuries', 'depth', 'inseason'];

export function isAppTabId(value: string | null | undefined): value is AppTabId {
  return !!value && TAB_IDS.includes(value as AppTabId);
}

export interface ParsedAppHash {
  tab: AppTabId | null;
  leagueId: string | null;
  compareIds: string[];
}

/** Parse `#tab=mock&league=league-abc&compare=id1,id2` or legacy `#mock`. */
export function parseAppHash(hash = location.hash): ParsedAppHash {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return { tab: null, leagueId: null, compareIds: [] };

  if (!raw.includes('=')) {
    const tab = isAppTabId(raw) ? raw : null;
    return { tab, leagueId: null, compareIds: [] };
  }

  const params = new URLSearchParams(raw);
  const tabParam = params.get('tab');
  const tab = isAppTabId(tabParam) ? tabParam : isAppTabId(raw.split('&')[0]) ? (raw.split('&')[0] as AppTabId) : null;
  const compareRaw = params.get('compare');
  const compareIds = compareRaw
    ? compareRaw
        .split(',')
        .map((s) => decodeURIComponent(s.trim()))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return { tab, leagueId: params.get('league'), compareIds };
}

export function writeAppHash(tab: AppTabId, leagueId?: string | null, compareIds?: string[]): void {
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (leagueId) params.set('league', leagueId);
  const compare = compareIds?.filter(Boolean) ?? [];
  if (compare.length) {
    params.set('compare', compare.map((id) => encodeURIComponent(id)).join(','));
  }
  const next = `#${params.toString()}`;
  if (location.hash !== next) {
    history.replaceState(null, '', `${location.pathname}${location.search}${next}`);
  }
}

export function syncHashFromApp(tab: AppTabId, leagueId: string, compareIds?: string[]): void {
  writeAppHash(tab, leagueId, compareIds);
}

export function syncCompareInHash(tab: AppTabId, compareIds: string[]): void {
  const { leagueId } = parseAppHash();
  writeAppHash(tab, leagueId ?? undefined, compareIds);
}
