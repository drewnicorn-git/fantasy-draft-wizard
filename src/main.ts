import './styles.css';
import {
  loadRankings,
  loadInjuries,
  loadInSeason,
  loadDepthCharts,
  getRankings,
  setScoringSettings,
  setState,
  state,
  subscribe,
  getSecondaryLoadFailureLabels,
  isSecondaryDataBannerVisible,
  dismissSecondaryDataBanner,
  retrySecondaryData,
} from './state/appState';
import { getActiveLeague } from './state/leaguesStore';
import { normalizeReceptionPoints } from './utils/leagueSettings';
import { mountRankingsView } from './pages/RankingsView';
import { mountMockDraftView } from './pages/MockDraftView';
import { mountLiveDraftView } from './pages/LiveDraftView';
import { mountInjuryReportView } from './pages/InjuryReportView';
import { mountInSeasonView } from './pages/InSeasonView';
import { mountDepthChartsView } from './pages/DepthChartsView';
import { mountLeagueSwitcher } from './components/LeagueSwitcher';
import { resetMockDraftModuleState } from './pages/MockDraftView';
import { syncAppStateFromActiveLeague } from './state/appState';
import { rankingsUpdatedAt } from './utils/rankingsMeta';

const app = document.querySelector<HTMLDivElement>('#app')!;

type TabId = 'rankings' | 'mock' | 'live' | 'injuries' | 'inseason' | 'depth';

let shellReady = false;
let mountedTab: TabId | null = null;
let bannerEventsBound = false;
let refreshLeagueSwitcher: (() => void) | null = null;

function onLeagueChanged(): void {
  resetMockDraftModuleState();
  syncAppStateFromActiveLeague();
  mountedTab = null;
  refreshLeagueSwitcher?.();
  render();
}

function bindBannerEvents(): void {
  if (bannerEventsBound) return;
  const retryBtn = app.querySelector('#retry-secondary-data');
  const dismissBtn = app.querySelector('#dismiss-data-banner');
  retryBtn?.addEventListener('click', () => {
    const btn = retryBtn as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Retrying…';
    void retrySecondaryData().finally(() => {
      btn.disabled = false;
      btn.textContent = 'Retry';
    });
  });
  dismissBtn?.addEventListener('click', () => dismissSecondaryDataBanner());
  bannerEventsBound = true;
}

function bindShellEvents(): void {
  app.querySelectorAll('[data-reception]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setScoringSettings({ receptionPoints: normalizeReceptionPoints(Number((btn as HTMLElement).dataset.reception)) });
    });
  });

  app.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setState({ tab: (btn as HTMLElement).dataset.tab as TabId });
    });
  });
}

function ensureShell(): void {
  if (shellReady && app.querySelector('header.app-header')) return;

  app.innerHTML = `
    <header class="app-header">
      <h1>Fantasy Draft Wizard</h1>
      <div class="header-controls">
        <div id="league-switcher"></div>
        <div class="scoring-toggle" role="group" aria-label="Scoring format">
          <button type="button" data-reception="0">Standard</button>
          <button type="button" data-reception="0.5">Half PPR</button>
          <button type="button" data-reception="1">Full PPR</button>
        </div>
        <span class="updated"></span>
      </div>
      <nav class="tabs">
        <button type="button" data-tab="rankings">Rankings</button>
        <button type="button" data-tab="mock">Mock Draft</button>
        <button type="button" data-tab="live">Live Draft</button>
        <button type="button" data-tab="injuries">Injuries</button>
        <button type="button" data-tab="depth">Depth Charts</button>
        <button type="button" data-tab="inseason">In Season</button>
      </nav>
    </header>
    <div id="data-load-banner" class="data-load-banner hidden" role="alert" aria-live="polite">
      <p id="data-load-banner-msg" class="data-load-banner-msg"></p>
      <div class="data-load-banner-actions">
        <button type="button" id="retry-secondary-data" class="btn secondary btn-xs">Retry</button>
        <button type="button" id="dismiss-data-banner" class="btn secondary btn-xs">Dismiss</button>
      </div>
    </div>
    <main id="main"></main>
    <footer class="app-footer">
      <p>Rankings from FantasyPros, ESPN, Sleeper, Fantasy Calc · ADP data from <a href="https://fantasyfootballcalculator.com" target="_blank" rel="noopener noreferrer">Fantasy Football Calculator</a> · In-season values refresh daily via GitHub Actions</p>
    </footer>`;

  bindShellEvents();
  bindBannerEvents();
  const leagueEl = app.querySelector('#league-switcher') as HTMLElement;
  refreshLeagueSwitcher = mountLeagueSwitcher(leagueEl, onLeagueChanged);
  shellReady = true;
}

function updateDataLoadBanner(): void {
  const banner = app.querySelector('#data-load-banner') as HTMLElement;
  const msg = app.querySelector('#data-load-banner-msg') as HTMLElement;
  if (!banner || !msg) return;

  const failures = getSecondaryLoadFailureLabels();
  const visible = isSecondaryDataBannerVisible();
  banner.classList.toggle('hidden', !visible);
  if (!visible) return;

  const list =
    failures.length === 1
      ? failures[0]
      : `${failures.slice(0, -1).join(', ')} and ${failures[failures.length - 1]}`;
  msg.textContent = `${list} unavailable — rankings still work. Retry or check back after the daily data refresh.`;
}

function updateShell(): void {
  const updated = rankingsUpdatedAt(getRankings());
  app.querySelectorAll('[data-reception]').forEach((btn) => {
    const reception = normalizeReceptionPoints(Number((btn as HTMLElement).dataset.reception));
    btn.classList.toggle('active', getActiveLeague().scoringSettings.receptionPoints === reception);
  });
  app.querySelectorAll('[data-tab]').forEach((btn) => {
    const tab = (btn as HTMLElement).dataset.tab;
    btn.classList.toggle('active', tab === state.tab);
  });
  const updatedEl = app.querySelector('.updated') as HTMLElement;
  updatedEl.textContent = updated ? `Updated ${new Date(updated).toLocaleString()}` : '';
  updateDataLoadBanner();
}

function mountCurrentTab(main: HTMLElement): void {
  if (state.tab === 'rankings') mountRankingsView(main);
  else if (state.tab === 'mock') mountMockDraftView(main);
  else if (state.tab === 'live') mountLiveDraftView(main);
  else if (state.tab === 'injuries') mountInjuryReportView(main);
  else if (state.tab === 'depth') mountDepthChartsView(main);
  else mountInSeasonView(main, render);
}

function shouldRemountMain(): boolean {
  if (mountedTab === null) return true;
  if (mountedTab !== state.tab) return true;
  // Keep mock draft mounted (timers + in-progress picks) unless the user leaves the tab.
  if (state.tab === 'mock') return false;
  return true;
}

function render(): void {
  ensureShell();
  updateShell();

  const main = app.querySelector('#main') as HTMLElement;
  if (!shouldRemountMain()) return;

  mountedTab = state.tab;
  mountCurrentTab(main);
}

async function init(): Promise<void> {
  app.innerHTML = '<p class="loading">Loading rankings…</p>';
  shellReady = false;
  mountedTab = null;
  try {
    await loadRankings();
    await Promise.all([loadInjuries(), loadInSeason(), loadDepthCharts()]);
    subscribe(render);
    render();
  } catch (err) {
    app.innerHTML = `<p class="error">Failed to load rankings: ${err instanceof Error ? err.message : err}. Run <code>npm run update:rankings</code> first.</p>`;
  }
}

init();
