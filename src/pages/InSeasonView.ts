import type { InSeasonState, Player } from '../data/types';
import { getInjuries, getInSeason, getRankings, setState, state } from '../state/appState';
import { getTeamDisplayName } from '../components/TeamNamesEditor';
import {
  dropPlayerFromTeam,
  ensureRosterLimits,
  getAllOwnedPlayerIds,
  getRosterCount,
  getRosterLimit,
  isRosterFull,
  resolveRosterPlayers,
  tryAddPlayerToTeam,
} from '../utils/rosterBuilder';
import { buildInSeasonAlerts, getInSeasonTargets, renderInSeasonAdvicePanel } from '../utils/inSeasonAdvice';
import { clearInSeasonState, loadInSeasonState, saveInSeasonState } from '../utils/storage';
import { posCssClass } from '../utils/position';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTeamSelectOptions(inSeasonState: InSeasonState, selectedTeam: number): string {
  return Array.from({ length: inSeasonState.config.teams }, (_, i) => {
    const label = getTeamDisplayName(i);
    const count = getRosterCount(inSeasonState, i);
    const limit = getRosterLimit(inSeasonState, i);
    const fullLabel = isRosterFull(inSeasonState, i) ? ' — full' : '';
    return `<option value="${i}" ${i === selectedTeam ? 'selected' : ''}>${escapeHtml(label)} (${count}/${limit})${fullLabel}</option>`;
  }).join('');
}

function renderRosterCard(teamIndex: number, roster: Player[], inSeasonState: InSeasonState): string {
  const title = getTeamDisplayName(teamIndex);
  const isMine = teamIndex === inSeasonState.myTeamIndex;
  const count = getRosterCount(inSeasonState, teamIndex);
  const limit = getRosterLimit(inSeasonState, teamIndex);
  return `
    <section class="inseason-team-card${isMine ? ' my-team' : ''}">
      <h3>${escapeHtml(title)} <span class="inseason-roster-count">${count}/${limit}</span>${isMine ? ' <span class="my-team-badge">Your team</span>' : ''}</h3>
      <div class="table-wrap inseason-roster-table-wrap">
        <table class="inseason-roster-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>Team</th>
              <th>Bye</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${
              roster.length
                ? roster
                    .map(
                      (p) => `
              <tr class="${posCssClass(String(p.pos))}">
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td><span class="pos-badge ${posCssClass(String(p.pos))}">${escapeHtml(String(p.pos))}</span></td>
                <td>${escapeHtml(p.team)}</td>
                <td>${p.bye ?? '—'}</td>
                <td><button type="button" class="btn secondary btn-xs" data-drop="${p.id}" data-team="${teamIndex}">Drop</button></td>
              </tr>`,
                    )
                    .join('')
                : '<tr><td colspan="5" class="hint">Empty roster</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderFaTable(players: Player[], inSeasonState: InSeasonState): string {
  if (!players.length) return '<p class="hint">No free agents match your search.</p>';

  const defaultTeam = inSeasonState.myTeamIndex;
  const teamOptions = renderTeamSelectOptions(inSeasonState, defaultTeam);

  return `
    <div class="table-wrap">
      <table class="inseason-fa-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th>Team</th>
            <th>Bye</th>
            <th>Proj</th>
            <th>Add to team</th>
          </tr>
        </thead>
        <tbody>
          ${players
            .slice(0, 100)
            .map((p) => {
              const inSeason = getInSeason();
              const proj =
                state.scoring === 'ppr'
                  ? inSeason?.players[p.id]?.weekProjPpr
                  : inSeason?.players[p.id]?.weekProjStd;
              const full = isRosterFull(inSeasonState, defaultTeam);
              return `
            <tr class="${posCssClass(String(p.pos))}">
              <td><strong>${escapeHtml(p.name)}</strong></td>
              <td><span class="pos-badge ${posCssClass(String(p.pos))}">${escapeHtml(String(p.pos))}</span></td>
              <td>${escapeHtml(p.team)}</td>
              <td>${p.bye ?? '—'}</td>
              <td>${proj != null ? proj.toFixed(1) : '—'}</td>
              <td class="inseason-fa-add-cell">
                <select class="inseason-fa-team-select" data-add-team-for="${p.id}" aria-label="Team for ${escapeHtml(p.name)}">
                  ${teamOptions}
                </select>
                <button type="button" class="btn primary btn-xs" data-add="${p.id}" ${full ? 'disabled title="Selected team is full"' : ''}>Add</button>
              </td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function updateFaAddButtons(faHost: HTMLElement, inSeasonState: InSeasonState): void {
  faHost.querySelectorAll<HTMLSelectElement>('[data-add-team-for]').forEach((select) => {
    const playerId = select.dataset.addTeamFor!;
    const teamIndex = Number(select.value);
    const btn = faHost.querySelector<HTMLButtonElement>(`[data-add="${playerId}"]`);
    if (!btn) return;
    const full = isRosterFull(inSeasonState, teamIndex);
    btn.disabled = full;
    btn.title = full ? 'Team is full — drop a player first' : '';
  });
}

export function mountInSeasonView(root: HTMLElement, onRefresh: () => void): void {
  const rankings = getRankings();
  const loaded = loadInSeasonState();
  const inSeasonData = getInSeason();
  const injuries = getInjuries();

  if (!rankings) {
    root.innerHTML = '<p class="error">Rankings not loaded.</p>';
    return;
  }

  if (!loaded?.active) {
    root.innerHTML = `
      <section class="panel">
        <h2>In-season management</h2>
        <p class="hint">Complete your live draft, then use <strong>Move to in season</strong> on the Live Draft tab to import league rosters here.</p>
      </section>`;
    return;
  }

  let inSeasonState = ensureRosterLimits(loaded);
  if (!loaded.rosterLimits) saveInSeasonState(inSeasonState);

  const allPlayers = rankings.players;
  const owned = getAllOwnedPlayerIds(inSeasonState.rosters);
  const myTeamIndex = inSeasonState.myTeamIndex;
  const myRoster = resolveRosterPlayers(inSeasonState.rosters[myTeamIndex] ?? [], allPlayers);
  const freeAgents = allPlayers.filter((p) => !owned.has(p.id));
  const targets = getInSeasonTargets(myRoster, freeAgents, inSeasonData, injuries, state.scoring);
  const alerts = buildInSeasonAlerts(myRoster);
  const updated = inSeasonData?.fetchedAt ?? inSeasonData?.builtAt ?? '';

  root.innerHTML = `
    <section class="panel inseason-panel">
      <div class="inseason-header">
        <div>
          <h2>In-season management</h2>
          <p class="hint">
            Week ${inSeasonData?.currentWeek ?? '—'} · Projections for week ${inSeasonData?.projectionWeek ?? '—'}
            ${updated ? ` · Data updated ${new Date(updated).toLocaleString()}` : ''}
          </p>
        </div>
        <div class="inseason-header-actions">
          <label for="inseason-my-team">My team</label>
          <select id="inseason-my-team" class="inseason-team-select">
            ${Array.from({ length: inSeasonState.config.teams }, (_, i) => {
              const label = getTeamDisplayName(i);
              return `<option value="${i}" ${i === myTeamIndex ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }).join('')}
          </select>
          <button type="button" id="inseason-undo" class="btn secondary">Undo move to in season</button>
        </div>
      </div>

      <div id="inseason-advice"></div>

      <div class="inseason-rosters-grid">
        ${Array.from({ length: inSeasonState.config.teams }, (_, teamIndex) =>
          renderRosterCard(
            teamIndex,
            resolveRosterPlayers(inSeasonState.rosters[teamIndex] ?? [], allPlayers),
            inSeasonState,
          ),
        ).join('')}
      </div>

      <div class="inseason-fa-section">
        <h3>Free agents &amp; waivers</h3>
        <p class="hint">Each team is capped at the roster size from when you moved to in season. Drop a player before adding when a team is full.</p>
        <label class="injury-search-label" for="inseason-fa-search">Search</label>
        <input type="search" id="inseason-fa-search" class="player-search-input" placeholder="Filter free agents…" autocomplete="off" />
        <div id="inseason-fa-table"></div>
      </div>
    </section>`;

  renderInSeasonAdvicePanel(root.querySelector('#inseason-advice') as HTMLElement, targets, alerts);

  const persistAndRefresh = (next: InSeasonState): void => {
    saveInSeasonState(ensureRosterLimits(next));
    onRefresh();
  };

  root.querySelector('#inseason-my-team')?.addEventListener('change', (e) => {
    const value = Number((e.target as HTMLSelectElement).value);
    persistAndRefresh({ ...inSeasonState, myTeamIndex: value });
  });

  root.querySelector('#inseason-undo')?.addEventListener('click', () => {
    if (
      confirm(
        'Reset in-season management and return to your completed live draft? All roster edits made here will be lost.',
      )
    ) {
      clearInSeasonState();
      setState({ tab: 'live' });
    }
  });

  root.querySelectorAll('[data-drop]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const playerId = (btn as HTMLElement).dataset.drop!;
      const teamIndex = Number((btn as HTMLElement).dataset.team);
      persistAndRefresh(dropPlayerFromTeam(inSeasonState, teamIndex, playerId));
    });
  });

  const faHost = root.querySelector('#inseason-fa-table') as HTMLElement;
  const searchEl = root.querySelector('#inseason-fa-search') as HTMLInputElement;

  const bindFaTable = (currentState: InSeasonState): void => {
    faHost.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const playerId = (btn as HTMLElement).dataset.add!;
        const select = faHost.querySelector<HTMLSelectElement>(`[data-add-team-for="${playerId}"]`);
        const teamIndex = Number(select?.value ?? currentState.myTeamIndex);
        const result = tryAddPlayerToTeam(currentState, teamIndex, playerId);
        if (result.error) {
          alert(result.error);
          return;
        }
        persistAndRefresh(result.state);
      });
    });

    faHost.querySelectorAll<HTMLSelectElement>('[data-add-team-for]').forEach((select) => {
      select.addEventListener('change', () => updateFaAddButtons(faHost, currentState));
    });

    updateFaAddButtons(faHost, currentState);
  };

  const renderFa = (): void => {
    const q = searchEl.value.trim().toLowerCase();
    const fa = freeAgents.filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    faHost.innerHTML = renderFaTable(fa, inSeasonState);
    bindFaTable(inSeasonState);
  };

  searchEl.addEventListener('input', renderFa);
  renderFa();
}
