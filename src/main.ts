import './styles.css';
import {
  loadRankings,
  loadInjuries,
  loadInSeason,
  loadDepthCharts,
  getRankings,
  getInjuries,
  getInSeason,
  getDepthCharts,
  setScoringSettings,
  setState,
  state,
  subscribe,
  getSecondaryLoadFailureLabels,
  isSecondaryDataBannerVisible,
  dismissSecondaryDataBanner,
  retrySecondaryData,
} from './state/appState';
import { getActiveLeague, setActiveLeague } from './state/leaguesStore';
import { FULL_PPR_SCORING, HALF_PPR_SCORING, STANDARD_SCORING } from './utils/fantasyPoints';
import { rulesMatch } from './utils/fantasyPoints';
import { mountRankingsView } from './pages/RankingsView';
import { mountMockDraftView } from './pages/MockDraftView';
import { mountLiveDraftView } from './pages/LiveDraftView';
import { mountInjuryReportView } from './pages/InjuryReportView';
import { mountInSeasonView } from './pages/InSeasonView';
import { mountDepthChartsView } from './pages/DepthChartsView';
import { mountLeagueSwitcher } from './components/LeagueSwitcher';
import { mountAuthPanel } from './components/AuthPanel';
import { resetMockDraftModuleState } from './pages/MockDraftView';
import { syncAppStateFromActiveLeague } from './state/appState';
import { setCloudPushHook } from './state/leaguesStore';
import { initCloudSync, scheduleCloudPush } from './services/cloudSync';
import {
  formatDataFreshness,
  formatDepthFreshness,
  formatInjuryFreshness,
  formatInSeasonFreshness,
} from './utils/rankingsMeta';
import { parseAppHash, syncHashFromApp, type AppTabId } from './utils/appRouting';
import { applyLayoutMode, loadLayoutMode, saveLayoutMode, type LayoutMode } from './utils/layoutMode';
import { mountPlayerComparePanel } from './components/PlayerComparePanel';
import { getComparePlayerIds, setComparePlayerIds } from './state/playerCompare';

const app = document.querySelector<HTMLDivElement>('#app')!;

type TabId = AppTabId;

let shellReady = false;
let mountedTab: TabId | null = null;
let bannerEventsBound = false;
let refreshLeagueSwitcher: (() => void) | null = null;
let hashRoutingBound = false;
let comparePanelMounted = false;

function onAuthChanged(): void {
  syncAppStateFromActiveLeague();
  mountedTab = null;
  refreshLeagueSwitcher?.();
  render();
}

function onLeagueChanged(): void {
  resetMockDraftModuleState();
  syncAppStateFromActiveLeague();
  mountedTab = null;
  refreshLeagueSwitcher?.();
  syncHashFromApp(state.tab, getActiveLeague().id, getComparePlayerIds());
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

function navigateToTab(tab: TabId): void {
  setState({ tab });
  syncHashFromApp(tab, getActiveLeague().id, getComparePlayerIds());
}

function bindShellEvents(): void {
  app.querySelectorAll('[data-scoring-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = (btn as HTMLElement).dataset.scoringPreset;
      if (preset === 'standard') setScoringSettings({ ...STANDARD_SCORING });
      else if (preset === 'half') setScoringSettings({ ...HALF_PPR_SCORING });
      else setScoringSettings({ ...FULL_PPR_SCORING });
    });
  });

  app.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateToTab((btn as HTMLElement).dataset.tab as TabId);
    });
  });

  app.querySelector('#layout-mode-toggle')?.addEventListener('click', () => {
    const next: LayoutMode = loadLayoutMode() === 'mobile' ? 'desktop' : 'mobile';
    saveLayoutMode(next);
    updateShell();
  });
}

function bindHashRouting(): void {
  if (hashRoutingBound) return;
  window.addEventListener('hashchange', () => {
    applyHashToApp(false);
  });
  hashRoutingBound = true;
}

function applyHashToApp(syncHash: boolean): void {
  const { tab, leagueId, compareIds } = parseAppHash();
  if (compareIds.length) setComparePlayerIds(compareIds);
  if (leagueId && leagueId !== getActiveLeague().id) {
    try {
      setActiveLeague(leagueId);
      syncAppStateFromActiveLeague();
      mountedTab = null;
      refreshLeagueSwitcher?.();
    } catch {
      /* unknown league id in URL — ignore */
    }
  }
  if (tab && tab !== state.tab) {
    setState({ tab });
  }
  if (syncHash) {
    syncHashFromApp(state.tab, getActiveLeague().id, getComparePlayerIds());
  }
}

function ensureShell(): void {
  if (shellReady && app.querySelector('header.app-header')) return;

  app.innerHTML = `
    <header class="app-header">
      <h1>Fantasy Draft Wizard</h1>
      <div class="header-controls">
        <div id="league-switcher"></div>
        <div id="auth-panel"></div>
        <div class="scoring-toggle" role="group" aria-label="Scoring format">
          <button type="button" data-scoring-preset="standard">Standard</button>
          <button type="button" data-scoring-preset="half">Half PPR</button>
          <button type="button" data-scoring-preset="full">Full PPR</button>
        </div>
        <button type="button" id="layout-mode-toggle" class="btn layout-mode-btn" aria-pressed="false" title="Toggle mobile-friendly layout">Layout: Desktop</button>
        <span class="updated"></span>
      </div>
      <nav class="tabs" role="tablist" aria-label="Main sections">
        <button type="button" role="tab" data-tab="rankings">Rankings</button>
        <button type="button" role="tab" data-tab="mock">Mock Draft</button>
        <button type="button" role="tab" data-tab="live">Live Draft</button>
        <button type="button" role="tab" data-tab="injuries">Injuries</button>
        <button type="button" role="tab" data-tab="depth">Depth Charts</button>
        <button type="button" role="tab" data-tab="inseason">In Season</button>
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
    <div id="player-compare-host" class="player-compare-host hidden"></div>
    <footer class="app-footer">
      <p>Rankings from FantasyPros, ESPN, Sleeper, Fantasy Calc · ADP data from <a href="https://fantasyfootballcalculator.com" target="_blank" rel="noopener noreferrer">Fantasy Football Calculator</a> · In-season values refresh daily via GitHub Actions</p>
    </footer>`;

  bindShellEvents();
  bindBannerEvents();
  bindHashRouting();
  const leagueEl = app.querySelector('#league-switcher') as HTMLElement;
  refreshLeagueSwitcher = mountLeagueSwitcher(leagueEl, onLeagueChanged);
  const authEl = app.querySelector('#auth-panel') as HTMLElement;
  mountAuthPanel(authEl, onAuthChanged);
  if (!comparePanelMounted) {
    const compareHost = app.querySelector('#player-compare-host') as HTMLElement;
    mountPlayerComparePanel(compareHost);
    comparePanelMounted = true;
  }
  shellReady = true;
}

function tabFreshnessLabel(tab: TabId): string {
  switch (tab) {
    case 'rankings': {
      const label = formatDataFreshness(getRankings());
      return label ? `Rankings updated ${label}` : '';
    }
    case 'injuries': {
      const label = formatInjuryFreshness(getInjuries());
      return label ? `Injuries: ${label}` : 'Injuries: data unavailable';
    }
    case 'depth': {
      const label = formatDepthFreshness(getDepthCharts());
      return label ? `Depth: ${label}` : 'Depth: data unavailable';
    }
    case 'inseason': {
      const label = formatInSeasonFreshness(getInSeason());
      return label ? `In season: ${label}` : 'In season: data unavailable';
    }
    case 'mock':
      return 'Mock draft — local to this league';
    case 'live':
      return 'Live draft — local to this league';
    default:
      return '';
  }
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
  const layoutMode = loadLayoutMode();
  applyLayoutMode(layoutMode);
  const layoutBtn = app.querySelector('#layout-mode-toggle') as HTMLButtonElement | null;
  if (layoutBtn) {
    const mobile = layoutMode === 'mobile';
    layoutBtn.textContent = mobile ? 'Layout: Mobile' : 'Layout: Desktop';
    layoutBtn.setAttribute('aria-pressed', mobile ? 'true' : 'false');
    layoutBtn.classList.toggle('active', mobile);
  }

  app.querySelectorAll('[data-scoring-preset]').forEach((btn) => {
    const preset = (btn as HTMLElement).dataset.scoringPreset;
    const rules = getActiveLeague().scoringSettings;
    const active =
      (preset === 'standard' && rulesMatch(rules, STANDARD_SCORING)) ||
      (preset === 'half' && rulesMatch(rules, HALF_PPR_SCORING)) ||
      (preset === 'full' && rulesMatch(rules, FULL_PPR_SCORING));
    btn.classList.toggle('active', !!active);
  });
  app.querySelectorAll('[data-tab]').forEach((btn) => {
    const tab = (btn as HTMLElement).dataset.tab;
    const active = tab === state.tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const updatedEl = app.querySelector('.updated') as HTMLElement;
  updatedEl.textContent = tabFreshnessLabel(state.tab);
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
  applyLayoutMode(loadLayoutMode());
  setCloudPushHook(scheduleCloudPush);
  applyHashToApp(false);

  app.innerHTML = '<p class="loading">Loading rankings…</p>';
  shellReady = false;
  mountedTab = null;
  try {
    await loadRankings();
    await Promise.all([loadInjuries(), loadInSeason(), loadDepthCharts()]);
    await initCloudSync(onAuthChanged);
    applyHashToApp(true);
    subscribe(render);
    render();
  } catch (err) {
    app.innerHTML = `<p class="error">Failed to load rankings: ${err instanceof Error ? err.message : err}. Run <code>npm run update:rankings</code> first.</p>`;
  }
}

init();
