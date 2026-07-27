import { filterPlayers, getRankings, state } from '../state/appState';
import { renderFilters, renderRankingsTable } from '../components/PlayerTable';

export function mountRankingsView(root: HTMLElement): void {
  const data = getRankings();
  if (!data) {
    root.innerHTML = '<p class="error">No rankings loaded.</p>';
    return;
  }

  root.innerHTML = `
    <section class="panel">
      <div id="rankings-filters"></div>
      <div id="rankings-meta" class="meta"></div>
      <div id="rankings-table"></div>
    </section>`;

  const filtersEl = root.querySelector('#rankings-filters') as HTMLElement;
  const tableEl = root.querySelector('#rankings-table') as HTMLElement;
  const metaEl = root.querySelector('#rankings-meta') as HTMLElement;

  const refresh = (): void => {
    const filtered = filterPlayers(data.players);
    metaEl.textContent = `${filtered.length} players · Sources: ${data.sources.join(', ')} · Season ${data.season}`;
    renderRankingsTable(tableEl, filtered, data.sources, state.scoring);
  };

  renderFilters(filtersEl, refresh);
  refresh();
}
