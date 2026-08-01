import type { DraftPick, Player } from '../data/types';
import { filterPlayers, getRankings, state } from '../state/appState';
import { mountRankingsPanel } from '../components/RankingsPanel';
import { renderDraftBoard } from '../components/DraftBoard';
import { getKeepersByTeam } from '../components/KeepersTable';
import { getTeamDisplayName } from '../components/TeamNamesEditor';
import { renderTeamNamesEditor } from '../components/TeamNamesEditor';
import { loadLiveDraft, saveLiveDraft, loadTeamNames, loadKeepers } from '../utils/storage';
import { getDraftAdvice, renderDraftAdvicePanel } from '../utils/draftAdvice';
import { moveLiveDraftToInSeason } from '../utils/rosterBuilder';
import { setState } from '../state/appState';
import { roundFromOverall, snakePickOrder } from '../sim/snake';

interface LiveDraftRuntime {
  picks: DraftPick[];
  draftedIds: Set<string>;
  currentIndex: number;
  active: boolean;
}

interface LiveDraftUi {
  root: HTMLElement;
  barEl: HTMLElement;
  adviceEl: HTMLElement;
  boardEl: HTMLElement;
  panelEl: HTMLElement;
  allPlayers: Player[];
  refreshAll: () => void;
}

let liveDraft: LiveDraftRuntime | null = null;
let panelRefresh: (() => void) | null = null;
let liveUi: LiveDraftUi | null = null;

export function mountLiveDraftView(root: HTMLElement): void {
  const data = getRankings();
  if (!data) {
    root.innerHTML = '<p class="error">No rankings loaded.</p>';
    return;
  }

  const saved = loadLiveDraft();
  if (saved?.active) {
    liveDraft = {
      picks: saved.picks,
      draftedIds: new Set(saved.picks.map((p) => p.playerId)),
      currentIndex: saved.currentIndex,
      active: true,
    };
  } else {
    liveDraft = null;
  }

  const active = liveDraft?.active ?? false;

  root.innerHTML = `
    <section class="panel live-draft">
      <div id="live-team-names"></div>
      <div id="live-draft-bar" class="live-draft-bar"></div>
      <div id="live-draft-active" class="live-draft-active ${active ? '' : 'hidden'}">
        <div id="live-draft-board" class="live-draft-board-panel"></div>
        <div id="live-draft-advice" class="live-draft-advice"></div>
        <div id="live-rankings-panel" class="live-draft-panel-body"></div>
      </div>
      <div id="live-rankings-setup" class="live-rankings-setup ${active ? 'hidden' : ''}">
        <div id="live-rankings-panel-setup"></div>
      </div>
    </section>`;

  const teamNamesEl = root.querySelector('#live-team-names') as HTMLElement;
  const barEl = root.querySelector('#live-draft-bar') as HTMLElement;
  const panelEl = active
    ? (root.querySelector('#live-rankings-panel') as HTMLElement)
    : (root.querySelector('#live-rankings-panel-setup') as HTMLElement);
  const boardEl = root.querySelector('#live-draft-board') as HTMLElement;
  const adviceEl = root.querySelector('#live-draft-advice') as HTMLElement;

  const refreshBoard = (): void => {
    if (!liveDraft?.active) return;
    const cfg = state.draftConfig;
    renderDraftBoard(boardEl, liveDraft.picks, cfg, cfg.slot, undefined, {
      title: 'Draft Board',
      keepersByTeam: getKeepersByTeam(data.players),
    });
  };

  const refreshAll = (): void => {
    renderDraftBar(barEl, root, data.players);
    renderLiveDraftAdvice(adviceEl, root, data.players);
    panelRefresh?.();
    if (liveDraft?.active) {
      refreshBoard();
    }
  };

  renderTeamNamesEditor(teamNamesEl, refreshAll);
  panelRefresh = mountRankingsPanel(panelEl, {
    tableMode: liveDraft?.active ? 'live-draft' : 'rankings',
    keepersMode: liveDraft?.active ? 'live-active' : 'live-setup',
    draftedIds: () => liveDraft?.draftedIds ?? new Set<string>(),
    draftOverall: () => (liveDraft?.currentIndex ?? 0) + 1,
    onPlayerPick: liveDraft?.active
      ? (playerId) => {
          recordLivePick(root, data.players, playerId);
        }
      : undefined,
  });

  liveUi = {
    root,
    barEl,
    adviceEl,
    boardEl,
    panelEl,
    allPlayers: data.players,
    refreshAll,
  };

  renderDraftBar(barEl, root, data.players);
  if (liveDraft?.active) {
    renderLiveDraftAdvice(adviceEl, root, data.players);
    refreshBoard();
  }
}

function getLiveTeamRoster(teamIndex: number, allPlayers: Player[]): Player[] {
  if (!liveDraft) return [];
  const fromPicks = liveDraft.picks
    .filter((p) => p.teamIndex === teamIndex)
    .map((p) => allPlayers.find((ap) => ap.id === p.playerId))
    .filter((p): p is Player => !!p);
  const keepers = getKeepersByTeam(allPlayers).get(teamIndex) ?? [];
  return [...keepers, ...fromPicks];
}

function renderLiveDraftAdvice(adviceEl: HTMLElement, root: HTMLElement, allPlayers: Player[]): void {
  if (!liveDraft?.active) {
    adviceEl.innerHTML = '';
    return;
  }

  const cfg = state.draftConfig;
  const order = snakePickOrder(cfg);
  if (liveDraft.currentIndex >= order.length) {
    adviceEl.innerHTML = '';
    return;
  }

  const teamIndex = order[liveDraft.currentIndex];
  const overall = liveDraft.currentIndex + 1;
  const isYou = teamIndex === cfg.slot - 1;
  const userRoster = getLiveTeamRoster(cfg.slot - 1, allPlayers);
  const available = filterPlayers(allPlayers, liveDraft.draftedIds, { uiFilters: false });
  const advice = getDraftAdvice(liveDraft.picks, userRoster, available, overall, cfg);

  if (!isYou) {
    renderDraftAdvicePanel(adviceEl, { ...advice, recommendation: '', suggestedPicks: [] }, {
      showSuggestions: false,
    });
    return;
  }

  renderDraftAdvicePanel(adviceEl, advice, {
    onPick: (playerId) => recordLivePick(root, allPlayers, playerId),
  });
}

function renderDraftBar(barEl: HTMLElement, root: HTMLElement, allPlayers: Player[]): void {
  const cfg = state.draftConfig;
  const order = snakePickOrder(cfg);
  const active = liveDraft?.active ?? false;
  const finished = liveDraft ? liveDraft.currentIndex >= order.length : false;

  if (!active) {
    barEl.innerHTML = `
      <div class="live-draft-controls">
        <p class="hint">Set team names above, assign keepers to teams below, then start your league draft.</p>
        <button type="button" id="start-live-draft" class="btn primary">Start live draft</button>
      </div>`;
    barEl.querySelector('#start-live-draft')!.addEventListener('click', () => {
      liveDraft = { picks: [], draftedIds: new Set(), currentIndex: 0, active: true };
      persistLiveDraft();
      mountLiveDraftView(root);
    });
    return;
  }

  if (finished) {
    barEl.innerHTML = `
      <div class="live-draft-controls">
        <h3>Draft complete</h3>
        <button type="button" id="move-in-season" class="btn primary">Move to in season</button>
        <button type="button" id="reset-live-draft" class="btn secondary">Reset draft</button>
        <button type="button" id="export-live-draft" class="btn secondary">Export JSON</button>
      </div>`;
    barEl.querySelector('#move-in-season')!.addEventListener('click', () => {
      const expected = cfg.teams * cfg.rounds;
      if (moveLiveDraftToInSeason(liveDraft!.picks, allPlayers, cfg, expected)) {
        setState({ tab: 'inseason' });
      }
    });
    barEl.querySelector('#reset-live-draft')!.addEventListener('click', () => {
      if (confirm('Reset the live draft? All picks will be cleared.')) {
        liveDraft = null;
        saveLiveDraft(null);
        mountLiveDraftView(root);
      }
    });
    barEl.querySelector('#export-live-draft')!.addEventListener('click', () => exportLiveDraft());
    return;
  }

  const teamIndex = order[liveDraft!.currentIndex];
  const overall = liveDraft!.currentIndex + 1;
  const { round, pickInRound } = roundFromOverall(overall, cfg.teams);
  const teamName = getTeamDisplayName(teamIndex);
  const isYou = teamIndex === cfg.slot - 1;

  barEl.innerHTML = `
    <div class="live-draft-controls on-clock-bar">
      <div>
        <strong>Round ${round}, pick ${pickInRound}</strong> · Overall ${overall}
        · <span class="${isYou ? 'your-turn' : ''}">${teamName} on the clock</span>
        ${isYou ? ' — click a player below to draft' : ' — select their pick from the table'}
      </div>
      <div class="draft-actions">
        <button type="button" id="undo-live-pick" class="btn secondary">Undo last pick</button>
        <button type="button" id="reset-live-draft" class="btn secondary">Reset draft</button>
      </div>
    </div>`;

  barEl.querySelector('#undo-live-pick')!.addEventListener('click', () => {
    undoLivePick(root, allPlayers);
  });

  barEl.querySelector('#reset-live-draft')!.addEventListener('click', () => {
    if (confirm('Reset the live draft? All picks will be cleared.')) {
      liveDraft = null;
      saveLiveDraft(null);
      mountLiveDraftView(root);
    }
  });
}

function recordLivePick(_root: HTMLElement, allPlayers: Player[], playerId: string): void {
  if (!liveDraft?.active) return;
  const cfg = state.draftConfig;
  const order = snakePickOrder(cfg);
  if (liveDraft.currentIndex >= order.length) return;

  const player = allPlayers.find((p) => p.id === playerId);
  if (!player || liveDraft.draftedIds.has(playerId)) return;
  if (loadKeepers().has(playerId)) return;

  const teamIndex = order[liveDraft.currentIndex];
  const overall = liveDraft.currentIndex + 1;
  const { round, pickInRound } = roundFromOverall(overall, cfg.teams);

  liveDraft.picks.push({
    round,
    pickInRound,
    overall,
    teamIndex,
    playerId: player.id,
    playerName: player.name,
    pos: player.pos,
  });
  liveDraft.draftedIds.add(player.id);
  liveDraft.currentIndex++;
  persistLiveDraft();

  liveUi?.refreshAll();
}

function undoLivePick(_root: HTMLElement, _allPlayers: Player[]): void {
  if (!liveDraft || liveDraft.picks.length === 0) return;
  const last = liveDraft.picks.pop()!;
  liveDraft.draftedIds.delete(last.playerId);
  liveDraft.currentIndex = Math.max(0, liveDraft.currentIndex - 1);
  persistLiveDraft();
  liveUi?.refreshAll();
}

function persistLiveDraft(): void {
  if (!liveDraft) {
    saveLiveDraft(null);
    return;
  }
  saveLiveDraft({
    active: liveDraft.active,
    picks: liveDraft.picks,
    currentIndex: liveDraft.currentIndex,
  });
}

function exportLiveDraft(): void {
  if (!liveDraft) return;
  const blob = new Blob(
    [JSON.stringify({ config: state.draftConfig, picks: liveDraft.picks, teamNames: loadTeamNames(state.draftConfig.teams) }, null, 2)],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `live-draft-${Date.now()}.json`;
  a.click();
}
