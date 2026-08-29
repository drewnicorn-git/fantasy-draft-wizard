import type { DraftPick, MockDraftSpeed, Player } from '../data/types';
import { filterPlayers, getRankings, applyDraftConfig, state, setState } from '../state/appState';
import { getKeepersByTeam } from '../components/KeepersTable';
import { renderDraftBoard } from '../components/DraftBoard';
import { renderRankingsTable } from '../components/PlayerTable';
import { mountPlayerSearch } from '../components/PlayerSearch';
import { getTeamDisplayName } from '../components/TeamNamesEditor';
import { loadTeamNames } from '../utils/storage';
import { botPick } from '../sim/bot';
import { BOT_ARCHETYPES, BOT_ARCHETYPE_LABELS, getBotProfileForTeam, normalizeBotProfiles } from '../sim/botProfiles';
import { getDraftAdvice, renderDraftAdvicePanel } from '../utils/draftAdvice';
import { preserveScroll } from '../utils/scrollPreserve';
import { picksUntilNextUserPick, roundFromOverall, snakePickOrder } from '../sim/snake';
import {
  clearMockDraft,
  loadMockDraft,
  saveMockDraft,
  type MockDraftPhase,
  type StoredMockDraft,
} from '../utils/mockDraftStorage';
import {
  loadAdpPlatform,
  loadBotProfiles,
  loadKeepers,
  loadMockDraftSpeed,
  saveAdpPlatform,
  saveBotProfiles,
  saveMockDraftSpeed,
} from '../utils/storage';
import { moveMockDraftToInSeason } from '../utils/rosterBuilder';
import { escapeHtml } from '../utils/escapeHtml';
import { getAdp, getProjectedPoints } from '../utils/scoring';
import { countByPosition } from '../utils/mockDraftSummary';

const SPEED_MS: Record<MockDraftSpeed, number> = {
  instant: 0,
  normal: 2_000,
  slow: 4_000,
};

interface DraftState {
  picks: DraftPick[];
  draftedIds: Set<string>;
  currentIndex: number;
  finished: boolean;
  history: DraftPick[][];
  mockDraftSpeed: MockDraftSpeed;
  paused: boolean;
}

let draft: DraftState | null = null;
let listenersAttached = false;
let botTimer: ReturnType<typeof setTimeout> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function persistDraft(phase: MockDraftPhase): void {
  if (!draft) {
    clearMockDraft();
    return;
  }
  saveMockDraft({
    picks: draft.picks,
    draftedIds: [...draft.draftedIds],
    currentIndex: draft.currentIndex,
    finished: draft.finished,
    history: draft.history,
    phase,
    mockDraftSpeed: draft.mockDraftSpeed,
  });
}

function restoreDraftFromStorage(stored: StoredMockDraft): DraftState {
  return {
    picks: stored.picks,
    draftedIds: new Set(stored.draftedIds),
    currentIndex: stored.currentIndex,
    finished: stored.finished,
    history: stored.history,
    mockDraftSpeed: stored.mockDraftSpeed ?? loadMockDraftSpeed(),
    paused: false,
  };
}

function seedKeeperIds(allPlayers: Player[]): Set<string> {
  const ids = new Set<string>();
  for (const p of allPlayers) {
    if (loadKeepers().has(p.id)) ids.add(p.id);
  }
  return ids;
}

function getMockTeamRoster(teamIndex: number, allPlayers: Player[]): Player[] {
  if (!draft) return [];
  const keepers = getKeepersByTeam(allPlayers).get(teamIndex) ?? [];
  const pickedIds = draft.picks.filter((p) => p.teamIndex === teamIndex).map((p) => p.playerId);
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  const roster: Player[] = [...keepers];
  for (const id of pickedIds) {
    const p = byId.get(id);
    if (p && !roster.some((x) => x.id === id)) roster.push(p);
  }
  return roster;
}

function botDelayMs(): number {
  if (!draft || draft.paused) return 999_999_999;
  return SPEED_MS[draft.mockDraftSpeed] ?? SPEED_MS.normal;
}

export function mountMockDraftView(root: HTMLElement): void {
  clearTimers();
  const data = getRankings();
  if (!data) {
    root.innerHTML = '<p class="error">No rankings loaded.</p>';
    return;
  }

  const stored = loadMockDraft();
  draft = stored ? restoreDraftFromStorage(stored) : null;

  root.innerHTML = `
    <section class="panel mock-draft">
      <div id="draft-setup" class="draft-setup"></div>
      <div id="draft-alerts" class="alerts"></div>
      <div id="draft-active" class="mock-draft-active hidden">
        <div class="draft-header">
          <div id="on-clock"></div>
          <div class="draft-actions">
            <label class="mock-speed-label">Speed
              <select id="mock-speed-select" class="mock-speed-select">
                <option value="instant">Instant</option>
                <option value="normal">Normal (2s)</option>
                <option value="slow">Slow (4s)</option>
              </select>
            </label>
            <button type="button" id="skip-to-pick" class="btn secondary btn-xs">Skip to my pick</button>
            <button type="button" id="toggle-pause" class="btn secondary btn-xs">Pause</button>
            <button type="button" id="redo-pick" class="btn secondary">Redo last pick</button>
            <button type="button" id="reset-mock-draft" class="btn secondary">Reset draft</button>
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

  const setupEl = () => root.querySelector('#draft-setup') as HTMLElement;
  const activeEl = () => root.querySelector('#draft-active') as HTMLElement;

  listenersAttached = false;

  if (!draft || stored?.phase === 'setup') {
    draft = null;
    clearMockDraft();
    renderSetup(root, data.players);
    return;
  }

  attachDraftActionListeners(root, data.players);
  setupEl().classList.add('hidden');

  if (stored?.phase === 'summary' || draft.finished) {
    activeEl().classList.add('hidden');
    renderDraftSummary(root, data.players);
    return;
  }

  activeEl().classList.remove('hidden');
  (root.querySelector('#draft-summary') as HTMLElement).classList.add('hidden');
  syncSpeedControls(root);
  advanceDraft(root, data.players);
}

function syncSpeedControls(root: HTMLElement): void {
  if (!draft) return;
  const sel = root.querySelector('#mock-speed-select') as HTMLSelectElement | null;
  if (sel) sel.value = draft.mockDraftSpeed;
  const pauseBtn = root.querySelector('#toggle-pause') as HTMLButtonElement | null;
  if (pauseBtn) pauseBtn.textContent = draft.paused ? 'Resume' : 'Pause';
}

function attachDraftActionListeners(root: HTMLElement, allPlayers: Player[]): void {
  if (listenersAttached) return;
  root.querySelector('#redo-pick')!.addEventListener('click', () => redoPick(root, allPlayers));
  root.querySelector('#reset-mock-draft')!.addEventListener('click', () => resetMockDraft(root, allPlayers));
  root.querySelector('#export-draft')!.addEventListener('click', () => exportDraft());
  root.querySelector('#skip-to-pick')!.addEventListener('click', () => skipToUserPick(root, allPlayers));
  root.querySelector('#toggle-pause')!.addEventListener('click', () => {
    if (!draft) return;
    draft.paused = !draft.paused;
    syncSpeedControls(root);
    if (!draft.paused) advanceDraft(root, allPlayers);
  });
  root.querySelector('#mock-speed-select')!.addEventListener('change', (e) => {
    if (!draft) return;
    const speed = (e.target as HTMLSelectElement).value as MockDraftSpeed;
    draft.mockDraftSpeed = speed;
    saveMockDraftSpeed(speed);
    persistDraft('active');
  });
  listenersAttached = true;
}

function skipToUserPick(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft || draft.paused) return;
  clearTimers();
  const cfg = state.draftConfig;
  const order = snakePickOrder(cfg);
  const userIndex = cfg.slot - 1;
  while (draft.currentIndex < order.length && order[draft.currentIndex] !== userIndex) {
    const teamIndex = order[draft.currentIndex];
    const overall = draft.currentIndex + 1;
    const { round, pickInRound } = roundFromOverall(overall, cfg.teams);
    const available = filterPlayers(allPlayers, draft.draftedIds, { uiFilters: false });
    if (!available.length) break;
    const roster = getMockTeamRoster(teamIndex, allPlayers);
    const profile = getBotProfileForTeam(loadBotProfiles(), teamIndex);
    const pick = botPick(available, roster, overall, cfg, profile, draft.picks);
    if (!pick) break;
    makePick(pick, teamIndex, round, pickInRound, overall);
  }
  persistDraft('active');
  advanceDraft(root, allPlayers);
}

function resetMockDraft(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft) return;
  if (!confirm('Reset this mock draft? All picks will be cleared.')) return;
  returnToMockSetup(root, allPlayers);
}

function returnToMockSetup(root: HTMLElement, allPlayers: Player[]): void {
  clearTimers();
  clearMockDraft();
  draft = null;
  listenersAttached = false;
  (root.querySelector('#draft-active') as HTMLElement).classList.add('hidden');
  (root.querySelector('#draft-summary') as HTMLElement).classList.add('hidden');
  (root.querySelector('#draft-alerts') as HTMLElement).innerHTML = '';
  (root.querySelector('#draft-setup') as HTMLElement).classList.remove('hidden');
  renderSetup(root, allPlayers);
}

export function resetMockDraftModuleState(): void {
  clearTimers();
  draft = null;
  listenersAttached = false;
}

function clearTimers(): void {
  if (botTimer) clearTimeout(botTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  botTimer = null;
  countdownTimer = null;
}

function renderDraftBoardPanel(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft) return;
  const cfg = state.draftConfig;
  renderDraftBoard(root.querySelector('#draft-board') as HTMLElement, draft.picks, cfg, cfg.slot, loadTeamNames(cfg.teams), {
    title: 'Draft Board',
    keepersByTeam: getKeepersByTeam(allPlayers),
  });
}

let panelRefreshOpts: {
  showPredictor?: boolean;
  currentPick?: number;
  picksUntilNext?: number;
  onPlayerPick?: (playerId: string) => void;
} = {};

function renderPlayerTable(
  root: HTMLElement,
  allPlayers: Player[],
  opts: {
    showPredictor?: boolean;
    currentPick?: number;
    picksUntilNext?: number;
    onPlayerPick?: (playerId: string) => void;
  },
): void {
  if (!draft) return;
  const cfg = state.draftConfig;
  const available = filterPlayers(allPlayers, draft.draftedIds);
  const panel = root.querySelector('#pick-list-panel') as HTMLElement;
  preserveScroll(panel, () => {
    if (!draft) return;
    renderRankingsTable(root.querySelector('#pick-list') as HTMLElement, available, cfg.scoring, {
      mode: 'mock-draft',
      showPredictor: opts.showPredictor,
      currentPick: opts.currentPick,
      picksUntilNext: opts.picksUntilNext,
      draftedIds: draft.draftedIds,
      showCompare: true,
      onPlayerPick: opts.onPlayerPick,
    });
  });
}

function renderPlayerPanel(
  root: HTMLElement,
  allPlayers: Player[],
  opts: {
    showPredictor?: boolean;
    currentPick?: number;
    picksUntilNext?: number;
    onPlayerPick?: (playerId: string) => void;
  },
): void {
  panelRefreshOpts = opts;
  mountPlayerSearch(root.querySelector('#pick-list-search') as HTMLElement, () => {
    renderPlayerTable(root, allPlayers, panelRefreshOpts);
  });
  renderPlayerTable(root, allPlayers, opts);
}

function renderSetup(root: HTMLElement, allPlayers: Player[]): void {
  const setup = root.querySelector('#draft-setup') as HTMLElement;
  const cfg = state.draftConfig;
  const keeperCount = loadKeepers().size;
  const profiles = normalizeBotProfiles(loadBotProfiles(), cfg.teams, cfg.slot);
  const adpPlatform = loadAdpPlatform();
  const speed = loadMockDraftSpeed();
  const teamNames = loadTeamNames(cfg.teams);

  setup.innerHTML = `
    <h2>Mock draft</h2>
    <p class="hint">Uses your league settings from Rankings (teams, slot, rounds, roster, scoring, keepers). Configure opponents below.</p>
    <div class="mock-league-summary">
      <p><strong>${cfg.teams}</strong> teams · slot <strong>${cfg.slot}</strong> · <strong>${cfg.rounds}</strong> rounds · ${keeperCount} keeper${keeperCount === 1 ? '' : 's'} · ${cfg.scoring.toUpperCase()} scoring</p>
      <p class="hint">Edit teams, roster, and keepers on the Rankings tab if needed.</p>
    </div>
    <div class="setup-grid">
      <label>Platform ADP
        <select id="cfg-adp-platform">
          <option value="consensus" ${adpPlatform === 'consensus' ? 'selected' : ''}>Consensus</option>
          <option value="espn" ${adpPlatform === 'espn' ? 'selected' : ''}>ESPN</option>
          <option value="sleeper" ${adpPlatform === 'sleeper' ? 'selected' : ''}>Sleeper</option>
          <option value="ffc" ${adpPlatform === 'ffc' ? 'selected' : ''}>Fantasy Calc</option>
        </select>
      </label>
      <label>Bot speed
        <select id="cfg-mock-speed">
          <option value="instant" ${speed === 'instant' ? 'selected' : ''}>Instant</option>
          <option value="normal" ${speed === 'normal' ? 'selected' : ''}>Normal (2s)</option>
          <option value="slow" ${speed === 'slow' ? 'selected' : ''}>Slow (4s)</option>
        </select>
      </label>
    </div>
    <h3>Opponent bots</h3>
    <div class="bot-profiles-grid">
      ${profiles
        .map((profile) => {
          const name = teamNames[profile.teamIndex] ?? `Team ${profile.teamIndex + 1}`;
          const options = BOT_ARCHETYPES.map(
            (a) =>
              `<option value="${a}" ${profile.archetype === a ? 'selected' : ''}>${escapeHtml(BOT_ARCHETYPE_LABELS[a])}</option>`,
          ).join('');
          return `<label class="bot-profile-row">${escapeHtml(name)}
            <select data-team="${profile.teamIndex}" class="bot-archetype-select">${options}</select>
          </label>`;
        })
        .join('')}
    </div>
    <button type="button" id="start-draft" class="btn primary">Start mock draft</button>`;

  setup.querySelector('#start-draft')!.addEventListener('click', () => {
    const adp = (setup.querySelector('#cfg-adp-platform') as HTMLSelectElement).value as typeof adpPlatform;
    const mockSpeed = (setup.querySelector('#cfg-mock-speed') as HTMLSelectElement).value as MockDraftSpeed;
    const updatedProfiles = profiles.map((p) => {
      const sel = setup.querySelector(`select[data-team="${p.teamIndex}"]`) as HTMLSelectElement;
      return { ...p, archetype: sel.value as typeof p.archetype };
    });
    saveBotProfiles(updatedProfiles);
    saveAdpPlatform(adp);
    saveMockDraftSpeed(mockSpeed);
    applyDraftConfig(cfg.teams, cfg.slot, cfg.rounds, undefined, cfg.keepersPerTeam, adp);
    startDraft(root, allPlayers, mockSpeed);
  });
}

function startDraft(root: HTMLElement, allPlayers: Player[], speed: MockDraftSpeed): void {
  clearTimers();
  const keeperIds = seedKeeperIds(allPlayers);
  draft = {
    picks: [],
    draftedIds: new Set(keeperIds),
    currentIndex: 0,
    finished: false,
    history: [],
    mockDraftSpeed: speed,
    paused: false,
  };
  (root.querySelector('#draft-setup') as HTMLElement).classList.add('hidden');
  (root.querySelector('#draft-active') as HTMLElement).classList.remove('hidden');
  (root.querySelector('#draft-summary') as HTMLElement).classList.add('hidden');

  attachDraftActionListeners(root, allPlayers);
  syncSpeedControls(root);
  persistDraft('active');
  advanceDraft(root, allPlayers);
}

function advanceDraft(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft || draft.paused) return;
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
  const delay = botDelayMs();
  let remaining = Math.ceil(delay / 1000);

  onClock.innerHTML = `<strong>Round ${round}, pick ${pickInRound}</strong> · Overall ${overall} · <span class="bot-picking">${escapeHtml(teamName)} on the clock</span>${delay > 0 ? ` · <span id="pick-countdown">${remaining}s</span>` : ''}`;
  (root.querySelector('#draft-alerts') as HTMLElement).innerHTML = `<div class="alert muted">Waiting for ${escapeHtml(teamName)} to pick… Browse available players below.</div>`;

  renderDraftBoardPanel(root, allPlayers);
  renderPlayerPanel(root, allPlayers, {});

  const runBot = (): void => {
    clearTimers();
    if (!draft || draft.paused) return;
    const available = filterPlayers(allPlayers, draft.draftedIds, { uiFilters: false });
    if (!available.length) {
      finishDraft(root, allPlayers);
      return;
    }
    const roster = getMockTeamRoster(teamIndex, allPlayers);
    const profile = getBotProfileForTeam(loadBotProfiles(), teamIndex);
    const pick = botPick(available, roster, overall, state.draftConfig, profile, draft.picks);
    if (!pick) {
      finishDraft(root, allPlayers);
      return;
    }
    makePick(pick, teamIndex, round, pickInRound, overall);
    advanceDraft(root, allPlayers);
  };

  if (delay <= 0) {
    runBot();
    return;
  }

  countdownTimer = setInterval(() => {
    remaining -= 1;
    const el = root.querySelector('#pick-countdown');
    if (el) el.textContent = `${Math.max(0, remaining)}s`;
  }, 1000);

  botTimer = setTimeout(runBot, delay);
}

function makePick(player: Player, teamIndex: number, round: number, pickInRound: number, overall: number): void {
  if (!draft || draft.finished) return;
  const order = snakePickOrder(state.draftConfig);
  if (draft.currentIndex >= order.length) return;
  if (order[draft.currentIndex] !== teamIndex) return;
  if (draft.draftedIds.has(player.id)) return;
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
  persistDraft('active');
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
  const untilNext = picksUntilNextUserPick(overall, cfg.slot, cfg);

  (root.querySelector('#on-clock') as HTMLElement).innerHTML = `
    <strong>Round ${round}, pick ${pickInRound}</strong> · Overall ${overall} · You're on the clock
    ${untilNext > 0 ? `<span class="muted">· ${untilNext} picks until your next turn</span>` : ''}`;

  const userRoster = getMockTeamRoster(cfg.slot - 1, allPlayers);
  const availableForAdvice = filterPlayers(allPlayers, draft.draftedIds, { uiFilters: false });
  const advice = getDraftAdvice(draft.picks, userRoster, availableForAdvice, overall, cfg, { style: 'vorp' });
  const pickPlayer = (playerId: string): void => {
    const player = allPlayers.find((p) => p.id === playerId);
    if (player) userPick(root, allPlayers, player, round, pickInRound, overall);
  };
  renderDraftAdvicePanel(root.querySelector('#draft-alerts') as HTMLElement, advice, {
    onPick: pickPlayer,
  });

  renderDraftBoardPanel(root, allPlayers);
  renderPlayerPanel(root, allPlayers, {
    showPredictor: true,
    currentPick: overall,
    picksUntilNext: untilNext,
    onPlayerPick: pickPlayer,
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

function finishDraft(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft) return;
  clearTimers();
  draft.finished = true;
  (root.querySelector('#draft-active') as HTMLElement).classList.add('hidden');
  renderDraftSummary(root, allPlayers);
  persistDraft('summary');
}

function renderDraftSummary(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft) return;
  const summary = root.querySelector('#draft-summary') as HTMLElement;
  summary.classList.remove('hidden');

  const cfg = state.draftConfig;
  const roster = getMockTeamRoster(cfg.slot - 1, allPlayers);
  const posCounts = countByPosition(roster);
  const totalProj = roster.reduce((s, p) => s + (getProjectedPoints(p) ?? 0), 0);

  const grades = roster.map((p) => {
    const adp = getAdp(p, cfg.scoring);
    const pick = draft!.picks.find((x) => x.playerId === p.id && x.teamIndex === cfg.slot - 1);
    const value = adp != null && pick ? adp - pick.overall : null;
    return { ...p, pick: pick?.overall, adp, value, proj: getProjectedPoints(p) };
  });

  const drafted = grades.filter((g) => g.pick != null);
  const best = [...drafted].sort((a, b) => (b.value ?? -999) - (a.value ?? -999))[0];
  const worst = [...drafted].sort((a, b) => (a.value ?? 999) - (b.value ?? -999))[0];

  summary.innerHTML = `
    <h2>Draft complete</h2>
    <div class="mock-summary-stats">
      <p>Projected team total: <strong>${totalProj.toFixed(1)}</strong> pts</p>
      <p>QB ${posCounts.QB} · RB ${posCounts.RB} · WR ${posCounts.WR} · TE ${posCounts.TE} · K ${posCounts.K} · DST ${posCounts.DST}</p>
    </div>
    ${best ? `<p>Best value: <strong>${escapeHtml(best.name)}</strong>${best.adp != null && best.pick ? ` (ADP ${best.adp.toFixed(1)} at pick ${best.pick})` : ''}</p>` : ''}
    ${worst && worst.id !== best?.id ? `<p>Reach: <strong>${escapeHtml(worst.name)}</strong>${worst.adp != null && worst.pick ? ` (ADP ${worst.adp.toFixed(1)} at pick ${worst.pick})` : ''}</p>` : ''}
    <h3>Your roster</h3>
    <ul class="roster-list">
      ${grades
        .map(
          (g) =>
            `<li><span class="pos">${escapeHtml(String(g.pos))}</span> ${escapeHtml(g.name)} <span class="muted">${escapeHtml(g.team)}${g.pick ? ` · pick ${g.pick}` : ' · keeper'}${g.proj != null ? ` · ${g.proj.toFixed(1)} proj` : ''}${g.adp != null ? ` · ADP ${g.adp.toFixed(1)}` : ''}</span></li>`,
        )
        .join('')}
    </ul>
    <div class="mock-summary-actions">
      <button type="button" id="import-inseason" class="btn primary">Send to In Season</button>
      <button type="button" id="new-draft" class="btn secondary">New mock draft</button>
    </div>`;

  summary.querySelector('#new-draft')!.addEventListener('click', () => {
    returnToMockSetup(root, allPlayers);
  });

  summary.querySelector('#import-inseason')!.addEventListener('click', () => {
    if (moveMockDraftToInSeason(draft!.picks, allPlayers, cfg)) {
      setState({ tab: 'inseason' });
    }
  });
}

function redoPick(root: HTMLElement, allPlayers: Player[]): void {
  if (!draft || draft.picks.length === 0) return;
  clearTimers();
  const last = draft.picks.pop()!;
  draft.draftedIds.delete(last.playerId);
  draft.currentIndex = Math.max(0, draft.currentIndex - 1);
  draft.finished = false;
  persistDraft('active');
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
