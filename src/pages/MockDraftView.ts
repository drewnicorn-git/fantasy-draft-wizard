import type { DraftPick, Player, ScoringFormat } from '../data/types';
import { filterPlayers, getRankings, applyDraftConfig, state } from '../state/appState';
import { renderDraftBoard } from '../components/DraftBoard';
import { renderRankingsTable } from '../components/PlayerTable';
import { renderPlayerSearch } from '../components/PlayerSearch';
import { getTeamDisplayName } from '../components/TeamNamesEditor';
import { botPick } from '../sim/bot';
import { getDraftAdvice, renderDraftAdvicePanel } from '../utils/draftAdvice';
import { preserveScroll } from '../utils/scrollPreserve';
import { picksUntilNextUserPick, roundFromOverall, snakePickOrder } from '../sim/snake';

const BOT_PICK_DELAY_MS = 2_000;

interface DraftState {
  picks: DraftPick[];
  draftedIds: Set<string>;
  currentIndex: number;
  finished: boolean;
  history: DraftPick[][];
}

let draft: DraftState | null = null;
let listenersAttached = false;
let botTimer: ReturnType<typeof setTimeout> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let pickListClickHandler: ((e: Event) => void) | null = null;

export function mountMockDraftView(root: HTMLElement): void {
  clearTimers();
  const data = getRankings();
  if (!data) {
    root.innerHTML = '<p class="error">No rankings loaded.</p>';
    return;
  }

  root.innerHTML = `
    <section class="panel mock-draft">
      <div id="draft-setup" class="draft-setup"></div>
      <div id="draft-alerts" class="alerts"></div>
      <div id="draft-active" class="mock-draft-active hidden">
        <div class="draft-header">
          <div id="on-clock"></div>
          <div class="draft-actions">
            <button type="button" id="redo-pick" class="btn secondary">Redo last pick</button>
            <button type="button" id="export-draft" class="btn secondary">Export JSON</button>
          </div>
        </div>
        <div id="draft-board" class="mock-draft-board-panel"></div>
        <div class="mock-draft-bottom">
          <div id="suggestions" class="mock-draft-suggestions"></div>
          <div id="pick-list-panel" class="mock-draft-players-panel">
            <div id="pick-list-search"></div>
            <div id="pick-list"></div>
          </div>
        </div>
      </div>
      <div id="draft-summary" class="hidden"></div>
    </section>`;

  renderSetup(root, data.players);
  listenersAttached = false;
  draft = null;
}

function clearTimers(): void {
  if (botTimer) clearTimeout(botTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  botTimer = null;
  countdownTimer = null;
}

function renderDraftBoardPanel(root: HTMLElement): void {
  if (!draft) return;
  const cfg = state.draftConfig;
  renderDraftBoard(root.querySelector('#draft-board') as HTMLElement, draft.picks, cfg, cfg.slot, undefined, {
    title: 'Draft Board',
  });
}

function renderPlayerPanel(
  root: HTMLElement,
  allPlayers: Player[],
  opts: { showPredictor?: boolean; currentPick?: number; picksUntilNext?: number },
): void {
  if (!draft) return;
  const cfg = state.draftConfig;
  const available = filterPlayers(allPlayers, draft.draftedIds);
  const panel = root.querySelector('#pick-list-panel') as HTMLElement;
  renderPlayerSearch(root.querySelector('#pick-list-search') as HTMLElement, () => {
    renderPlayerPanel(root, allPlayers, opts);
  });
  preserveScroll(panel, () => {
    if (!draft) return;
    renderRankingsTable(root.querySelector('#pick-list') as HTMLElement, available, cfg.scoring, {
      mode: 'mock-draft',
      showPredictor: opts.showPredictor,
      currentPick: opts.currentPick,
      picksUntilNext: opts.picksUntilNext,
      draftedIds: draft.draftedIds,
    });
  });
}

function renderSuggestionsPanel(root: HTMLElement, suggestions: Player[] = [], placeholder = ''): void {
  const el = root.querySelector('#suggestions') as HTMLElement;
  if (suggestions.length) {
    el.innerHTML = `
      <h3>Suggested picks</h3>
      <div class="suggestion-chips">
        ${suggestions.map((p) => `<button type="button" class="chip pick-btn" data-id="${p.id}">${p.name} (${p.pos})</button>`).join('')}
      </div>`;
  } else {
    el.innerHTML = placeholder ? `<p class="suggestions-placeholder muted">${placeholder}</p>` : '<p class="suggestions-placeholder muted">&nbsp;</p>';
  }
}

function renderSetup(root: HTMLElement, allPlayers: Player[]): void {
  const setup = root.querySelector('#draft-setup') as HTMLElement;
  const cfg = state.draftConfig;

  setup.innerHTML = `
    <h2>Mock draft setup</h2>
    <p class="hint">Snake order: round 1 goes 1→${cfg.teams}, round 2 goes ${cfg.teams}→1, and alternates. Bot picks wait 2 seconds between selections.</p>
    <div class="setup-grid">
      <label>Teams <input type="number" id="cfg-teams" min="8" max="14" value="${cfg.teams}" /></label>
      <label>Your slot <input type="number" id="cfg-slot" min="1" max="${cfg.teams}" value="${cfg.slot}" /></label>
      <label>Rounds <input type="number" id="cfg-rounds" min="15" max="20" value="${cfg.rounds}" /></label>
      <label>Bot style
        <select id="cfg-bot">
          <option value="balanced">Balanced</option>
          <option value="zero-rb">Zero RB</option>
          <option value="hero-rb">Hero RB</option>
        </select>
      </label>
    </div>
    <button type="button" id="start-draft" class="btn primary">Start snake draft</button>`;

  const teamsInput = setup.querySelector('#cfg-teams') as HTMLInputElement;
  const slotInput = setup.querySelector('#cfg-slot') as HTMLInputElement;

  teamsInput.addEventListener('change', () => {
    const teams = Number(teamsInput.value);
    slotInput.max = String(teams);
    if (Number(slotInput.value) > teams) slotInput.value = String(teams);
    applyDraftConfig(teams, Number(slotInput.value), Number((setup.querySelector('#cfg-rounds') as HTMLInputElement).value));
  });

  setup.querySelector('#start-draft')!.addEventListener('click', () => {
    const teams = Number(teamsInput.value);
    const slot = Number(slotInput.value);
    const rounds = Number((setup.querySelector('#cfg-rounds') as HTMLInputElement).value);
    const botPersonality = (setup.querySelector('#cfg-bot') as HTMLSelectElement).value as typeof state.botPersonality;
    applyDraftConfig(teams, slot, rounds, botPersonality);
    startDraft(root, allPlayers);
  });
}

function startDraft(root: HTMLElement, allPlayers: Player[]): void {
  clearTimers();
  draft = { picks: [], draftedIds: new Set(), currentIndex: 0, finished: false, history: [] };
  (root.querySelector('#draft-setup') as HTMLElement).classList.add('hidden');
  (root.querySelector('#draft-active') as HTMLElement).classList.remove('hidden');
  (root.querySelector('#draft-summary') as HTMLElement).classList.add('hidden');

  if (!listenersAttached) {
    root.querySelector('#redo-pick')!.addEventListener('click', () => redoPick(root, allPlayers));
    root.querySelector('#export-draft')!.addEventListener('click', () => exportDraft());
    listenersAttached = true;
  }

  advanceDraft(root, allPlayers);
}

function advanceDraft(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft) return;
  clearTimers();
  const cfg = state.draftConfig;
  const order = snakePickOrder(cfg);

  if (draft.currentIndex >= order.length) {
    finishDraft(root, allPlayers);
    return;
  }

  const teamIndex = order[draft.currentIndex];
  const overall = draft.currentIndex + 1;
  const { round, pickInRound } = roundFromOverall(overall, cfg.teams);
  const isUser = teamIndex === cfg.slot - 1;

  if (isUser) {
    renderUserTurn(root, allPlayers, overall, round, pickInRound);
    return;
  }

  scheduleBotPick(root, allPlayers, teamIndex, overall, round, pickInRound);
}

function scheduleBotPick(
  root: HTMLElement,
  allPlayers: Player[],
  teamIndex: number,
  overall: number,
  round: number,
  pickInRound: number,
): void {
  const teamName = getTeamDisplayName(teamIndex);
  const onClock = root.querySelector('#on-clock') as HTMLElement;
  let remaining = BOT_PICK_DELAY_MS / 1000;

  onClock.innerHTML = `<strong>Round ${round}, pick ${pickInRound}</strong> · Overall ${overall} · <span class="bot-picking">${teamName} on the clock</span> · <span id="pick-countdown">${remaining}s</span>`;
  (root.querySelector('#draft-alerts') as HTMLElement).innerHTML = `<div class="alert muted">Waiting for ${teamName} to pick… Browse available players below.</div>`;

  renderDraftBoardPanel(root);
  renderSuggestionsPanel(root, [], 'Suggested picks appear when you are on the clock.');
  renderPlayerPanel(root, allPlayers, {});

  countdownTimer = setInterval(() => {
    remaining -= 1;
    const el = root.querySelector('#pick-countdown');
    if (el) el.textContent = `${Math.max(0, remaining)}s`;
  }, 1000);

  botTimer = setTimeout(() => {
    clearTimers();
    const available = filterPlayers(allPlayers, draft!.draftedIds);
    if (!available.length) {
      finishDraft(root, allPlayers);
      return;
    }
    const roster = getTeamRoster(teamIndex, allPlayers);
    const pick = botPick(available, roster, overall, state.draftConfig, state.botPersonality);
    if (!pick) {
      finishDraft(root, allPlayers);
      return;
    }
    makePick(pick, teamIndex, round, pickInRound, overall);
    advanceDraft(root, allPlayers);
  }, BOT_PICK_DELAY_MS);
}

function makePick(player: Player, teamIndex: number, round: number, pickInRound: number, overall: number): void {
  if (!draft) return;
  draft.history.push([...draft.picks]);
  draft.picks.push({
    round,
    pickInRound,
    overall,
    teamIndex,
    playerId: player.id,
    playerName: player.name,
    pos: player.pos,
  });
  draft.draftedIds.add(player.id);
  draft.currentIndex++;
}

function getTeamRoster(teamIndex: number, allPlayers: Player[]): Player[] {
  if (!draft) return [];
  const ids = draft.picks.filter((p) => p.teamIndex === teamIndex).map((p) => p.playerId);
  return ids.map((id) => allPlayers.find((p) => p.id === id)!).filter(Boolean);
}

function renderUserTurn(
  root: HTMLElement,
  allPlayers: Player[],
  overall: number,
  round: number,
  pickInRound: number,
): void {
  if (!draft) return;
  const cfg = state.draftConfig;
  const available = filterPlayers(allPlayers, draft.draftedIds);
  const untilNext = picksUntilNextUserPick(overall, cfg.slot, cfg);

  (root.querySelector('#on-clock') as HTMLElement).innerHTML = `
    <strong>Round ${round}, pick ${pickInRound}</strong> · Overall ${overall} · You're on the clock
    ${untilNext > 0 ? `<span class="muted">· ${untilNext} picks until your next turn</span>` : ''}`;

  const userRoster = getTeamRoster(cfg.slot - 1, allPlayers);
  const advice = getDraftAdvice(draft.picks, userRoster, available, overall, cfg);
  renderDraftAdvicePanel(root.querySelector('#draft-alerts') as HTMLElement, advice, {
    onPick: (playerId) => {
      const player = allPlayers.find((p) => p.id === playerId);
      if (player) userPick(root, allPlayers, player, round, pickInRound, overall);
    },
  });

  renderDraftBoardPanel(root);
  renderSuggestionsPanel(root, []);
  renderPlayerPanel(root, allPlayers, {
    showPredictor: true,
    currentPick: overall,
    picksUntilNext: untilNext,
  });

  root.querySelectorAll('.pick-btn').forEach((el) => {
    el.addEventListener('click', (e) => {
      const id = (el as HTMLElement).dataset.id;
      if (!id) return;
      const player = allPlayers.find((p) => p.id === id);
      if (!player) return;
      e.stopPropagation();
      userPick(root, allPlayers, player, round, pickInRound, overall);
    });
  });

  const pickList = root.querySelector('#pick-list') as HTMLElement;
  const tbody = pickList.querySelector('tbody');
  if (tbody) {
    if (pickListClickHandler) tbody.removeEventListener('click', pickListClickHandler);
    pickListClickHandler = (e) => {
      const tr = (e.target as HTMLElement).closest('tr[data-id]');
      if (!tr) return;
      const id = tr.getAttribute('data-id')!;
      const player = allPlayers.find((p) => p.id === id);
      if (player) userPick(root, allPlayers, player, round, pickInRound, overall);
    };
    tbody.addEventListener('click', pickListClickHandler);
  }
}

function userPick(
  root: HTMLElement,
  allPlayers: Player[],
  player: Player,
  round: number,
  pickInRound: number,
  overall: number,
): void {
  makePick(player, state.draftConfig.slot - 1, round, pickInRound, overall);
  advanceDraft(root, allPlayers);
}

function finishDraft(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft) return;
  clearTimers();
  draft.finished = true;
  (root.querySelector('#draft-active') as HTMLElement).classList.add('hidden');
  const summary = root.querySelector('#draft-summary') as HTMLElement;
  summary.classList.remove('hidden');

  const cfg = state.draftConfig;
  const scoring: ScoringFormat = cfg.scoring;
  const roster = getTeamRoster(cfg.slot - 1, allPlayers);
  const grades = roster.map((p) => {
    const adp = p.adp[scoring];
    const pick = draft!.picks.find((x) => x.playerId === p.id && x.teamIndex === cfg.slot - 1);
    const value = adp != null && pick ? adp - pick.overall : 0;
    return { ...p, pick: pick?.overall, adp, value };
  });

  const best = [...grades].sort((a, b) => b.value - a.value)[0];
  const worst = [...grades].sort((a, b) => a.value - b.value)[0];

  summary.innerHTML = `
    <h2>Draft complete</h2>
    <p>Best value: <strong>${best?.name ?? '—'}</strong>${best?.adp != null ? ` (ADP ${best.adp.toFixed(1)} at pick ${best.pick})` : ''}</p>
    <p>Reach: <strong>${worst?.name ?? '—'}</strong>${worst?.adp != null ? ` (ADP ${worst.adp.toFixed(1)} at pick ${worst.pick})` : ''}</p>
    <h3>Your roster</h3>
    <ul class="roster-list">
      ${grades.map((g) => `<li><span class="pos">${g.pos}</span> ${g.name} <span class="muted">${g.team}${g.adp != null ? ` · ADP ${g.adp.toFixed(1)}` : ''}</span></li>`).join('')}
    </ul>
    <button type="button" id="new-draft" class="btn primary">New mock draft</button>`;

  summary.querySelector('#new-draft')!.addEventListener('click', () => {
    summary.classList.add('hidden');
    (root.querySelector('#draft-setup') as HTMLElement).classList.remove('hidden');
    draft = null;
  });
}

function redoPick(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft || draft.picks.length === 0) return;
  clearTimers();
  const last = draft.picks.pop()!;
  draft.draftedIds.delete(last.playerId);
  draft.currentIndex = Math.max(0, draft.currentIndex - 1);
  advanceDraft(root, allPlayers);
}

function exportDraft(): void {
  if (!draft) return;
  const blob = new Blob([JSON.stringify({ config: state.draftConfig, picks: draft.picks }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mock-draft-${Date.now()}.json`;
  a.click();
}
