import type { DraftPick, Player } from '../data/types';
import { getRankings, state } from '../state/appState';
import { mountRankingsPanel } from '../components/RankingsPanel';
import { renderDraftBoard } from '../components/DraftBoard';
import { getTeamDisplayName } from '../components/TeamNamesEditor';
import { renderTeamNamesEditor } from '../components/TeamNamesEditor';
import { loadLiveDraft, saveLiveDraft, loadTeamNames } from '../utils/storage';
import { roundFromOverall, snakePickOrder } from '../sim/snake';

interface LiveDraftRuntime {
  picks: DraftPick[];
  draftedIds: Set<string>;
  currentIndex: number;
  active: boolean;
}

let liveDraft: LiveDraftRuntime | null = null;
let panelRefresh: (() => void) | null = null;

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

  root.innerHTML = `
    <section class="panel live-draft">
      <div id="live-team-names"></div>
      <div id="live-draft-bar" class="live-draft-bar"></div>
      <div id="live-rankings-panel"></div>
      <div id="live-draft-board-wrap" class="${liveDraft?.active ? '' : 'hidden'}"></div>
    </section>`;

  const teamNamesEl = root.querySelector('#live-team-names') as HTMLElement;
  const barEl = root.querySelector('#live-draft-bar') as HTMLElement;
  const panelEl = root.querySelector('#live-rankings-panel') as HTMLElement;
  const boardWrap = root.querySelector('#live-draft-board-wrap') as HTMLElement;

  const refreshAll = (): void => {
    renderDraftBar(barEl, root, data.players, boardWrap);
    panelRefresh?.();
    if (liveDraft?.active) {
      boardWrap.classList.remove('hidden');
      renderDraftBoard(boardWrap, liveDraft.picks, state.draftConfig, state.draftConfig.slot);
    } else {
      boardWrap.classList.add('hidden');
    }
  };

  renderTeamNamesEditor(teamNamesEl, refreshAll);
  panelRefresh = mountRankingsPanel(panelEl, {
    tableMode: liveDraft?.active ? 'live-draft' : 'rankings',
    draftedIds: liveDraft?.draftedIds,
    onPlayerPick: liveDraft?.active
      ? (playerId) => {
          recordLivePick(root, data.players, playerId, boardWrap);
        }
      : undefined,
  });

  renderDraftBar(barEl, root, data.players, boardWrap);
  if (liveDraft?.active) {
    boardWrap.classList.remove('hidden');
    renderDraftBoard(boardWrap, liveDraft.picks, state.draftConfig, state.draftConfig.slot);
  }
}

function renderDraftBar(
  barEl: HTMLElement,
  root: HTMLElement,
  allPlayers: Player[],
  boardWrap: HTMLElement,
): void {
  const cfg = state.draftConfig;
  const order = snakePickOrder(cfg);
  const active = liveDraft?.active ?? false;
  const finished = liveDraft ? liveDraft.currentIndex >= order.length : false;

  if (!active) {
    barEl.innerHTML = `
      <div class="live-draft-controls">
        <p class="hint">Set team names above, then start your league draft. Click a player in the table to draft them when it is their turn.</p>
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
        <button type="button" id="reset-live-draft" class="btn secondary">Reset draft</button>
        <button type="button" id="export-live-draft" class="btn secondary">Export JSON</button>
      </div>`;
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
    undoLivePick(root, allPlayers, boardWrap);
  });

  barEl.querySelector('#reset-live-draft')!.addEventListener('click', () => {
    if (confirm('Reset the live draft? All picks will be cleared.')) {
      liveDraft = null;
      saveLiveDraft(null);
      mountLiveDraftView(root);
    }
  });
}

function recordLivePick(root: HTMLElement, allPlayers: Player[], playerId: string, _boardWrap: HTMLElement): void {
  if (!liveDraft?.active) return;
  const cfg = state.draftConfig;
  const order = snakePickOrder(cfg);
  if (liveDraft.currentIndex >= order.length) return;

  const player = allPlayers.find((p) => p.id === playerId);
  if (!player || liveDraft.draftedIds.has(playerId)) return;

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

  mountLiveDraftView(root);
}

function undoLivePick(root: HTMLElement, _allPlayers: Player[], _boardWrap: HTMLElement): void {
  if (!liveDraft || liveDraft.picks.length === 0) return;
  const last = liveDraft.picks.pop()!;
  liveDraft.draftedIds.delete(last.playerId);
  liveDraft.currentIndex = Math.max(0, liveDraft.currentIndex - 1);
  persistLiveDraft();
  mountLiveDraftView(root);
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
