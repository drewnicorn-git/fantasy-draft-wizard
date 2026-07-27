import { filterPlayers, getActiveSources, getRankings, state } from '../state/appState';
import { renderFilters, renderRankingsTable, renderTagManager } from '../components/PlayerTable';
import { renderSourceSelector } from '../components/SourceSelector';
import { renderLeagueSettings } from '../components/LeagueSettings';
import { SOURCE_LABELS } from '../utils/scoring';
import { formatPickLabel, getUserPickNumbers } from '../sim/snake';

export function mountRankingsView(root: HTMLElement): void {
  const data = getRankings();
  if (!data) {
    root.innerHTML = '<p class="error">No rankings loaded.</p>';
    return;
  }

  root.innerHTML = `
    <section class="panel">
      <div id="rankings-sources"></div>
      <div id="rankings-league"></div>
      <div id="rankings-tags"></div>
      <div id="rankings-filters"></div>
      <div id="rankings-meta" class="meta"></div>
      <div id="rankings-table"></div>
    </section>`;

  const sourcesEl = root.querySelector('#rankings-sources') as HTMLElement;
  const leagueEl = root.querySelector('#rankings-league') as HTMLElement;
  const tagsEl = root.querySelector('#rankings-tags') as HTMLElement;
  const filtersEl = root.querySelector('#rankings-filters') as HTMLElement;
  const tableEl = root.querySelector('#rankings-table') as HTMLElement;
  const metaEl = root.querySelector('#rankings-meta') as HTMLElement;

  const refresh = (): void => {
    const filtered = filterPlayers(data.players);
    const active = getActiveSources();
    const sourceLabels = active.map((s) => SOURCE_LABELS[s]).join(', ');
    const picks = getUserPickNumbers(state.draftConfig.teams, state.draftConfig.slot, state.draftConfig.rounds);
    const pickPreview = picks
      .slice(0, 4)
      .map((p) => formatPickLabel(p, state.draftConfig.teams))
      .join(', ');
    metaEl.textContent = `${filtered.length} players · Consensus from: ${sourceLabels || 'none'} · ${state.draftConfig.teams}-team league, slot ${state.draftConfig.slot} · Your picks: ${pickPreview}… · Season ${data.season}`;
    renderRankingsTable(tableEl, filtered, state.scoring);
  };

  renderSourceSelector(sourcesEl, refresh);
  renderLeagueSettings(leagueEl, refresh);
  renderTagManager(tagsEl, refresh);
  renderFilters(filtersEl, refresh);
  refresh();
}
