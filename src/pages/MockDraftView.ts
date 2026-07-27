import type { DraftPick, Player, ScoringFormat } from '../data/types';
import { filterPlayers, getRankings, setState, state } from '../state/appState';
import { renderDraftBoard, renderRosterSummary } from '../components/DraftBoard';
import { renderRankingsTable } from '../components/PlayerTable';
import { botPick, suggestedPicks } from '../sim/bot';
import { byeWeekConflicts, detectPositionalRun } from '../utils/analytics';
import { picksUntilNextUserPick, roundFromOverall, snakePickOrder } from '../sim/snake';

interface DraftState {
  picks: DraftPick[];
  draftedIds: Set<string>;
  currentIndex: number;
  finished: boolean;
  history: DraftPick[][];
}

let draft: DraftState | null = null;

export function mountMockDraftView(root: HTMLElement): void {
  const data = getRankings();
  if (!data) {
    root.innerHTML = '<p class="error">No rankings loaded.</p>';
    return;
  }

  root.innerHTML = `
    <section class="panel mock-draft">
      <div id="draft-setup" class="draft-setup"></div>
      <div id="draft-alerts" class="alerts"></div>
      <div id="draft-active" class="hidden">
        <div class="draft-header">
          <div id="on-clock"></div>
          <div class="draft-actions">
            <button type="button" id="redo-pick" class="btn secondary">Redo last pick</button>
            <button type="button" id="export-draft" class="btn secondary">Export JSON</button>
          </div>
        </div>
        <div class="draft-layout">
          <div class="draft-left">
            <div id="suggestions"></div>
            <div id="pick-list"></div>
          </div>
          <div class="draft-right">
            <div id="user-roster"></div>
            <div id="draft-board"></div>
          </div>
        </div>
      </div>
      <div id="draft-summary" class="hidden"></div>
    </section>`;

  renderSetup(root, data.players);
}

function renderSetup(root: HTMLElement, allPlayers: Player[]): void {
  const setup = root.querySelector('#draft-setup') as HTMLElement;
  const cfg = state.draftConfig;

  setup.innerHTML = `
    <h2>Mock draft setup</h2>
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
    setState({ draftConfig: { ...state.draftConfig, teams, slot: Number(slotInput.value) } });
  });

  setup.querySelector('#start-draft')!.addEventListener('click', () => {
    const teams = Number(teamsInput.value);
    const slot = Number(slotInput.value);
    const rounds = Number((setup.querySelector('#cfg-rounds') as HTMLInputElement).value);
    const botPersonality = (setup.querySelector('#cfg-bot') as HTMLSelectElement).value as typeof state.botPersonality;
    setState({
      draftConfig: { teams, slot, rounds, scoring: state.scoring },
      botPersonality,
    });
    startDraft(root, allPlayers);
  });
}

let listenersAttached = false;

function startDraft(root: HTMLElement, allPlayers: Player[]): void {
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
  const cfg = state.draftConfig;
  const order = snakePickOrder(cfg);

  while (draft.currentIndex < order.length) {
    const teamIndex = order[draft.currentIndex];
    const overall = draft.currentIndex + 1;
    const { round, pickInRound } = roundFromOverall(overall, cfg.teams);
    const isUser = teamIndex === cfg.slot - 1;

    if (isUser) {
      renderUserTurn(root, allPlayers, overall, round, pickInRound);
      return;
    }

    const available = allPlayers.filter((p) => !draft!.draftedIds.has(p.id));
    const roster = getTeamRoster(teamIndex, allPlayers);
    const pick = botPick(available, roster, overall, cfg, state.botPersonality);
    makePick(pick, teamIndex, round, pickInRound, overall);
  }

  finishDraft(root, allPlayers);
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
  const suggestions = suggestedPicks(available, cfg.scoring);
  const untilNext = picksUntilNextUserPick(overall, cfg.slot, cfg);

  (root.querySelector('#on-clock') as HTMLElement).innerHTML = `
    <strong>Round ${round}, pick ${pickInRound}</strong> · Overall ${overall} · You're on the clock
    ${untilNext > 0 ? `<span class="muted">· ${untilNext} picks until your next turn</span>` : ''}`;

  (root.querySelector('#suggestions') as HTMLElement).innerHTML = `
    <h3>Suggested picks</h3>
    <div class="suggestion-chips">
      ${suggestions.map((p) => `<button type="button" class="chip pick-btn" data-id="${p.id}">${p.name} (${p.pos})</button>`).join('')}
    </div>`;

  const alerts: string[] = [];
  const recent = draft.picks.slice(-4);
  for (const pos of ['RB', 'WR', 'TE']) {
    if (detectPositionalRun(recent, pos)) alerts.push(`${pos} run — ${pos}s going fast`);
  }
  const userRoster = getTeamRoster(cfg.slot - 1, allPlayers);
  const byes = byeWeekConflicts(userRoster);
  if (byes.length) alerts.push(`Bye conflict weeks: ${byes.join(', ')}`);
  (root.querySelector('#draft-alerts') as HTMLElement).innerHTML = alerts
    .map((a) => `<div class="alert">${a}</div>`)
    .join('');

  renderRankingsTable(
    root.querySelector('#pick-list') as HTMLElement,
    available,
    getRankings()!.sources,
    cfg.scoring,
    { showPredictor: true, currentPick: overall, picksUntilNext: untilNext, draftedIds: draft.draftedIds },
  );

  renderDraftBoard(root.querySelector('#draft-board') as HTMLElement, draft.picks, cfg, cfg.slot);
  renderUserRoster(root, allPlayers);

  root.querySelectorAll('.pick-btn, tr[data-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const id = (el as HTMLElement).dataset.id ?? (el as HTMLElement).closest('tr')?.getAttribute('data-id');
      if (!id) return;
      const player = allPlayers.find((p) => p.id === id);
      if (!player) return;
      e.stopPropagation();
      userPick(root, allPlayers, player, round, pickInRound, overall);
    });
  });

  root.querySelector('#pick-list tbody')?.addEventListener('click', (e) => {
    const tr = (e.target as HTMLElement).closest('tr[data-id]');
    if (!tr || (e.target as HTMLElement).closest('[data-tag]')) return;
    const id = tr.getAttribute('data-id')!;
    const player = allPlayers.find((p) => p.id === id);
    if (player) userPick(root, allPlayers, player, round, pickInRound, overall);
  });
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

function renderUserRoster(root: HTMLElement, allPlayers: Player[]): void {
  const cfg = state.draftConfig;
  const scoring: ScoringFormat = cfg.scoring;
  const roster = getTeamRoster(cfg.slot - 1, allPlayers).map((p) => ({
    name: p.name,
    pos: p.pos,
    team: p.team,
    adp: p.adp[scoring],
  }));
  renderRosterSummary(root.querySelector('#user-roster') as HTMLElement, roster);
}

function finishDraft(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft) return;
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
