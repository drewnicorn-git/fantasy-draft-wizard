import { filterPlayers, getActiveSources, getRankings, state } from '../state/appState';
import { renderFilters, renderRankingsTable, renderTagManager } from './PlayerTable';
import { renderSourceSelector } from './SourceSelector';
import { renderLeagueSettings } from './LeagueSettings';
import { renderSheetToolbar } from './SheetToolbar';
import { SOURCE_LABELS } from '../utils/scoring';
import { formatPickLabel, getUserPickNumbers } from '../sim/snake';
import { loadKeepers } from '../utils/storage';

export interface RankingsPanelOptions {
  tableMode?: 'rankings' | 'live-draft';
  onPlayerPick?: (playerId: string) => void;
  draftedIds?: Set<string>;
  includeKeepers?: boolean;
}

export function mountRankingsPanel(root: HTMLElement, options: RankingsPanelOptions = {}): () => void {
  const data = getRankings();
  if (!data) {
    root.innerHTML = '<p class="error">No rankings loaded.</p>';
    return () => {};
  }

  root.innerHTML = `
    <div id="rankings-sources"></div>
    <div id="rankings-toolbar"></div>
    <div id="rankings-league"></div>
    <div id="rankings-tags"></div>
    <div id="rankings-filters"></div>
    <div id="rankings-meta" class="meta"></div>
    <div id="rankings-table"></div>`;

  const sourcesEl = root.querySelector('#rankings-sources') as HTMLElement;
  const toolbarEl = root.querySelector('#rankings-toolbar') as HTMLElement;
  const leagueEl = root.querySelector('#rankings-league') as HTMLElement;
  const tagsEl = root.querySelector('#rankings-tags') as HTMLElement;
  const filtersEl = root.querySelector('#rankings-filters') as HTMLElement;
  const tableEl = root.querySelector('#rankings-table') as HTMLElement;
  const metaEl = root.querySelector('#rankings-meta') as HTMLElement;

  const refresh = (): void => {
    const draftedIds = options.draftedIds ?? new Set<string>();
    const includeKeepers = options.includeKeepers ?? options.tableMode === 'rankings';
    const filtered = filterPlayers(data.players, draftedIds, { includeKeepers });
    const active = getActiveSources();
    const sourceLabels = active.map((s) => SOURCE_LABELS[s]).join(', ');
    const picks = getUserPickNumbers(state.draftConfig.teams, state.draftConfig.slot, state.draftConfig.rounds);
    const pickPreview = picks
      .slice(0, 4)
      .map((p) => formatPickLabel(p, state.draftConfig.teams))
      .join(', ');
    const keeperCount = loadKeepers().size;
    const keeperNote = keeperCount > 0 ? ` · ${keeperCount} keeper${keeperCount === 1 ? '' : 's'}` : '';
    metaEl.textContent = `${filtered.length} available · Consensus: ${sourceLabels || 'none'} · ${state.draftConfig.teams}-team, slot ${state.draftConfig.slot} · Picks: ${pickPreview}…${keeperNote} · Season ${data.season}`;
    renderRankingsTable(tableEl, filtered, state.scoring, {
      mode: options.tableMode ?? 'rankings',
      onPlayerPick: options.onPlayerPick,
    });
  };

  renderSourceSelector(sourcesEl, refresh);
  renderSheetToolbar(toolbarEl, refresh);
  renderLeagueSettings(leagueEl, refresh);
  renderTagManager(tagsEl, refresh);
  renderFilters(filtersEl, refresh);
  refresh();

  return refresh;
}
