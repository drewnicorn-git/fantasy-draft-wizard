import { filterPlayers, getActiveSources, getRankings, state } from '../state/appState';
import { renderFilters, renderTagManager } from './PlayerTable';
import { renderPlayerSearch } from './PlayerSearch';
import { renderSourceSelector } from './SourceSelector';
import { renderLeagueSettings } from './LeagueSettings';
import { renderSheetToolbar } from './SheetToolbar';
import { renderRankingsTable } from './PlayerTable';
import { renderKeepersTable } from './KeepersTable';
import { SOURCE_LABELS } from '../utils/scoring';
import { formatPickLabel, getRemainingUserPickNumbers, getUserPickNumbers } from '../sim/snake';
import { loadKeepers } from '../utils/storage';
import { preserveScroll } from '../utils/scrollPreserve';

export interface RankingsPanelOptions {
  tableMode?: 'rankings' | 'live-draft';
  keepersMode?: 'rankings' | 'live-setup' | 'live-active';
  onPlayerPick?: (playerId: string) => void;
  draftedIds?: Set<string> | (() => Set<string>);
  draftOverall?: number | (() => number);
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
    <div id="rankings-search"></div>
    <div id="rankings-table"></div>
    <div id="rankings-keepers"></div>`;

  const sourcesEl = root.querySelector('#rankings-sources') as HTMLElement;
  const toolbarEl = root.querySelector('#rankings-toolbar') as HTMLElement;
  const leagueEl = root.querySelector('#rankings-league') as HTMLElement;
  const tagsEl = root.querySelector('#rankings-tags') as HTMLElement;
  const filtersEl = root.querySelector('#rankings-filters') as HTMLElement;
  const searchEl = root.querySelector('#rankings-search') as HTMLElement;
  const tableEl = root.querySelector('#rankings-table') as HTMLElement;
  const keepersEl = root.querySelector('#rankings-keepers') as HTMLElement;
  const metaEl = root.querySelector('#rankings-meta') as HTMLElement;

  const refresh = (): void => {
    const draftedIds =
      typeof options.draftedIds === 'function' ? options.draftedIds() : (options.draftedIds ?? new Set<string>());
    const draftOverall =
      typeof options.draftOverall === 'function' ? options.draftOverall() : (options.draftOverall ?? 1);
    const filtered = filterPlayers(data.players, draftedIds, { includeKeepers: false });
    const active = getActiveSources();
    const sourceLabels = active.map((s) => SOURCE_LABELS[s]).join(', ');
    const keeperCount = loadKeepers().size;
    const keeperNote = keeperCount > 0 ? ` · ${keeperCount} keeper${keeperCount === 1 ? '' : 's'}` : '';

    const keeperMode =
      options.keepersMode ??
      (options.tableMode === 'live-draft' ? 'live-active' : 'rankings');

    renderKeepersTable(keepersEl, {
      mode: keeperMode,
      scoring: state.scoring,
      players: data.players,
      onChange: refresh,
    });

    const picks =
      options.tableMode === 'live-draft' && draftOverall
        ? getRemainingUserPickNumbers(
            draftOverall,
            state.draftConfig.teams,
            state.draftConfig.slot,
            state.draftConfig.rounds,
          )
        : getUserPickNumbers(state.draftConfig.teams, state.draftConfig.slot, state.draftConfig.rounds);
    const pickPreview = picks
      .slice(0, 4)
      .map((p) => formatPickLabel(p, state.draftConfig.teams))
      .join(', ');
    const pickLabel = options.tableMode === 'live-draft' && draftOverall ? 'Next picks' : 'Picks';
    metaEl.textContent = `${filtered.length} available · Consensus: ${sourceLabels || 'none'} · ${state.draftConfig.teams}-team, slot ${state.draftConfig.slot} · ${pickLabel}: ${pickPreview}${picks.length > 4 ? '…' : ''}${keeperNote} · Season ${data.season}`;

    preserveScroll(tableEl, () => {
      renderRankingsTable(tableEl, filtered, state.scoring, {
        mode: options.tableMode === 'live-draft' ? 'live-draft' : 'rankings',
        onPlayerPick: options.onPlayerPick,
        draftOverall,
        onKeeperChange: refresh,
        onManualRankChange: refresh,
      });
    });
  };

  renderSourceSelector(sourcesEl, refresh);
  renderSheetToolbar(toolbarEl, refresh);
  renderLeagueSettings(leagueEl, refresh);
  renderTagManager(tagsEl, refresh);
  renderFilters(filtersEl, refresh);
  renderPlayerSearch(searchEl, refresh);
  refresh();

  return refresh;
}
