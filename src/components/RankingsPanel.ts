import { filterPlayers, getActiveSources, getRankings, state } from '../state/appState';
import { renderFilters, renderTagManager } from './PlayerTable';
import { renderManualRankingsTable } from './ManualRankingsTable';
import { renderSourceSelector } from './SourceSelector';
import { renderLeagueSettings } from './LeagueSettings';
import { renderSheetToolbar } from './SheetToolbar';
import { renderManualToolbar } from './ManualToolbar';
import { renderRankingsTable } from './PlayerTable';
import { SOURCE_LABELS } from '../utils/scoring';
import { formatPickLabel, getRemainingUserPickNumbers, getUserPickNumbers } from '../sim/snake';
import { loadKeepers } from '../utils/storage';
import {
  buildConsensusOrder,
  buildSheetRanks,
  loadManualOrderStore,
  mergeManualOrder,
  saveManualOrderStore,
} from '../utils/manualOrder';

export interface RankingsPanelOptions {
  tableMode?: 'rankings' | 'live-draft' | 'manual';
  onPlayerPick?: (playerId: string) => void;
  draftedIds?: Set<string>;
  includeKeepers?: boolean;
  draftOverall?: number;
}

export function mountRankingsPanel(root: HTMLElement, options: RankingsPanelOptions = {}): () => void {
  const data = getRankings();
  if (!data) {
    root.innerHTML = '<p class="error">No rankings loaded.</p>';
    return () => {};
  }

  const isManual = options.tableMode === 'manual';
  let manualOrder = mergeManualOrder(
    loadManualOrderStore(state.scoring).order,
    data.players,
    state.scoring,
  );
  let manualDirty = false;
  let manualSavedAt = loadManualOrderStore(state.scoring).savedAt;

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

  const renderToolbar = (): void => {
    if (isManual) {
      renderManualToolbar(toolbarEl, { dirty: manualDirty, savedAt: manualSavedAt }, {
        onSave: () => {
          const saved = saveManualOrderStore(state.scoring, manualOrder);
          manualSavedAt = saved.savedAt;
          manualDirty = false;
          renderToolbar();
          refresh();
        },
        onReset: () => {
          manualOrder = buildConsensusOrder(data.players, state.scoring);
          manualDirty = true;
          renderToolbar();
          refresh();
        },
      });
    } else {
      renderSheetToolbar(toolbarEl, refresh);
    }
  };

  const refresh = (): void => {
    const draftedIds = options.draftedIds ?? new Set<string>();
    const includeKeepers = options.includeKeepers ?? (options.tableMode === 'rankings' || isManual);
    const filtered = filterPlayers(data.players, draftedIds, { includeKeepers });
    const active = getActiveSources();
    const sourceLabels = active.map((s) => SOURCE_LABELS[s]).join(', ');
    const keeperCount = loadKeepers().size;
    const keeperNote = keeperCount > 0 ? ` · ${keeperCount} keeper${keeperCount === 1 ? '' : 's'}` : '';

    if (isManual) {
      const dirtyNote = manualDirty ? ' · unsaved changes' : '';
      const savedNote = manualSavedAt && !manualDirty ? ` · saved ${new Date(manualSavedAt).toLocaleString()}` : '';
      metaEl.textContent = `${filtered.length} players · Manual sort${dirtyNote}${savedNote} · Consensus: ${sourceLabels || 'none'} · ${state.draftConfig.teams}-team, slot ${state.draftConfig.slot}${keeperNote} · Season ${data.season}`;
      renderManualRankingsTable(tableEl, filtered, state.scoring, {
        manualOrder,
        sheetRanks: buildSheetRanks(data.players, state.scoring),
        onManualOrderChange: (order) => {
          manualOrder = order;
          manualDirty = true;
          renderToolbar();
          refresh();
        },
      });
      return;
    }

    const picks =
      options.tableMode === 'live-draft' && options.draftOverall
        ? getRemainingUserPickNumbers(
            options.draftOverall,
            state.draftConfig.teams,
            state.draftConfig.slot,
            state.draftConfig.rounds,
          )
        : getUserPickNumbers(state.draftConfig.teams, state.draftConfig.slot, state.draftConfig.rounds);
    const pickPreview = picks
      .slice(0, 4)
      .map((p) => formatPickLabel(p, state.draftConfig.teams))
      .join(', ');
    const pickLabel = options.tableMode === 'live-draft' && options.draftOverall ? 'Next picks' : 'Picks';
    metaEl.textContent = `${filtered.length} available · Consensus: ${sourceLabels || 'none'} · ${state.draftConfig.teams}-team, slot ${state.draftConfig.slot} · ${pickLabel}: ${pickPreview}${picks.length > 4 ? '…' : ''}${keeperNote} · Season ${data.season}`;
    renderRankingsTable(tableEl, filtered, state.scoring, {
      mode: options.tableMode === 'live-draft' ? 'live-draft' : 'rankings',
      onPlayerPick: options.onPlayerPick,
      draftOverall: options.draftOverall ?? 1,
    });
  };

  renderSourceSelector(sourcesEl, refresh);
  renderToolbar();
  renderLeagueSettings(leagueEl, refresh);
  renderTagManager(tagsEl, refresh);
  renderFilters(filtersEl, refresh);
  refresh();

  return refresh;
}
