import './styles.css';
import { loadRankings, loadInjuries, loadInSeason, getRankings, setScoring, setState, state, subscribe } from './state/appState';
import { mountRankingsView } from './pages/RankingsView';
import { mountMockDraftView } from './pages/MockDraftView';
import { mountLiveDraftView } from './pages/LiveDraftView';
import { mountInjuryReportView } from './pages/InjuryReportView';
import { mountInSeasonView } from './pages/InSeasonView';

const app = document.querySelector<HTMLDivElement>('#app')!;

type TabId = 'rankings' | 'mock' | 'live' | 'injuries' | 'inseason';

function render(): void {
  const data = getRankings();
  const updated = data?.fetchedAt ?? data?.builtAt ?? '';

  app.innerHTML = `
    <header class="app-header">
      <h1>Fantasy Draft Wizard</h1>
      <div class="header-controls">
        <div class="scoring-toggle" role="group" aria-label="Scoring format">
          <button type="button" class="${state.scoring === 'std' ? 'active' : ''}" data-scoring="std">Standard</button>
          <button type="button" class="${state.scoring === 'ppr' ? 'active' : ''}" data-scoring="ppr">PPR</button>
        </div>
        ${updated ? `<span class="updated">Updated ${new Date(updated).toLocaleString()}</span>` : ''}
      </div>
      <nav class="tabs">
        <button type="button" class="${state.tab === 'rankings' ? 'active' : ''}" data-tab="rankings">Rankings</button>
        <button type="button" class="${state.tab === 'mock' ? 'active' : ''}" data-tab="mock">Mock Draft</button>
        <button type="button" class="${state.tab === 'live' ? 'active' : ''}" data-tab="live">Live Draft</button>
        <button type="button" class="${state.tab === 'injuries' ? 'active' : ''}" data-tab="injuries">Injuries</button>
        <button type="button" class="${state.tab === 'inseason' ? 'active' : ''}" data-tab="inseason">In Season</button>
      </nav>
    </header>
    <main id="main"></main>
    <footer class="app-footer">
      <p>Rankings from FantasyPros, ESPN, Sleeper, Yahoo, NFL.com · In-season values refresh daily via GitHub Actions</p>
    </footer>`;

  app.querySelectorAll('[data-scoring]').forEach((btn) => {
    btn.addEventListener('click', () => setScoring((btn as HTMLElement).dataset.scoring as 'std' | 'ppr'));
  });

  app.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setState({ tab: (btn as HTMLElement).dataset.tab as TabId });
    });
  });

  const main = app.querySelector('#main') as HTMLElement;
  if (state.tab === 'rankings') mountRankingsView(main);
  else if (state.tab === 'mock') mountMockDraftView(main);
  else if (state.tab === 'live') mountLiveDraftView(main);
  else if (state.tab === 'injuries') mountInjuryReportView(main);
  else mountInSeasonView(main, render);
}

async function init(): Promise<void> {
  app.innerHTML = '<p class="loading">Loading rankings…</p>';
  try {
    await loadRankings();
    await Promise.all([loadInjuries(), loadInSeason()]);
    subscribe(render);
    render();
  } catch (err) {
    app.innerHTML = `<p class="error">Failed to load rankings: ${err instanceof Error ? err.message : err}. Run <code>npm run update:rankings</code> first.</p>`;
  }
}

init();
