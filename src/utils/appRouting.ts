export type AppTabId = 'rankings' | 'mock' | 'live' | 'injuries' | 'inseason' | 'depth';

const TAB_IDS: AppTabId[] = ['rankings', 'mock', 'live', 'injuries', 'depth', 'inseason'];

export function isAppTabId(value: string | null | undefined): value is AppTabId {
  return !!value && TAB_IDS.includes(value as AppTabId);
}

export interface ParsedAppHash {
  tab: AppTabId | null;
  leagueId: string | null;
}

/** Parse `#tab=mock&league=league-abc` or legacy `#mock`. */
export function parseAppHash(hash = location.hash): ParsedAppHash {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return { tab: null, leagueId: null };

  if (!raw.includes('=')) {
    const tab = isAppTabId(raw) ? raw : null;
    return { tab, leagueId: null };
  }

  const params = new URLSearchParams(raw);
  const tabParam = params.get('tab');
  const tab = isAppTabId(tabParam) ? tabParam : isAppTabId(raw.split('&')[0]) ? (raw.split('&')[0] as AppTabId) : null;
  return { tab, leagueId: params.get('league') };
}

export function writeAppHash(tab: AppTabId, leagueId?: string | null): void {
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (leagueId) params.set('league', leagueId);
  const next = `#${params.toString()}`;
  if (location.hash !== next) {
    history.replaceState(null, '', `${location.pathname}${location.search}${next}`);
  }
}

export function syncHashFromApp(tab: AppTabId, leagueId: string): void {
  writeAppHash(tab, leagueId);
}
