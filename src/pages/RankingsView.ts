import { filterPlayers, getActiveSources, getRankings, state } from '../state/appState';
import { renderFilters, renderRankingsTable, renderTagManager } from '../components/PlayerTable';
import { renderSourceSelector } from '../components/SourceSelector';
import { SOURCE_LABELS } from '../utils/scoring';

export function mountRankingsView(root: HTMLElement): void {
  const data = getRankings();
  if (!data) {
    root.innerHTML = '<p class="error">No rankings loaded.</p>';
    return;
  }

  root.innerHTML = `
    <section class="panel">
      <div id="rankings-sources"></div>
      <div id="rankings-tags"></div>
      <div id="rankings-filters"></div>
      <div id="rankings-meta" class="meta"></div>
      <div id="rankings-table"></div>
    </section>`;

  const sourcesEl = root.querySelector('#rankings-sources') as HTMLElement;
  const tagsEl = root.querySelector('#rankings-tags') as HTMLElement;
  const filtersEl = root.querySelector('#rankings-filters') as HTMLElement;
  const tableEl = root.querySelector('#rankings-table') as HTMLElement;
  const metaEl = root.querySelector('#rankings-meta') as HTMLElement;

  const refresh = (): void => {
    const filtered = filterPlayers(data.players);
    const active = getActiveSources();
    const sourceLabels = active.map((s) => SOURCE_LABELS[s]).join(', ');
    metaEl.textContent = `${filtered.length} players · Consensus from: ${sourceLabels || 'none'} · Season ${data.season} · * = team unverified`;
    renderRankingsTable(tableEl, filtered, state.scoring);
  };

  renderSourceSelector(sourcesEl, refresh);
  renderTagManager(tagsEl, refresh);
  renderFilters(filtersEl, refresh);
  refresh();
}
