import type { Player, ScoringFormat } from '../data/types';
import { getSheetLocked, state } from '../state/appState';
import { getAdp, getConsensus } from '../utils/scoring';
import { formatPosRankLabel, posCssClass } from '../utils/position';
import { getTeamDisplayName } from './TeamNamesEditor';
import {
  getKeeperTeam,
  loadKeepers,
  setKeeperTeam,
  toggleKeeper,
} from '../utils/storage';

export interface KeepersTableOptions {
  mode: 'rankings' | 'manual' | 'live-setup' | 'live-active';
  scoring: ScoringFormat;
  players: Player[];
  manualOrder?: string[];
  onChange: () => void;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function keeperPlayers(allPlayers: Player[]): Player[] {
  const ids = loadKeepers();
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  return [...ids].map((id) => byId.get(id)).filter((p): p is Player => !!p);
}

function sortKeepers(players: Player[], manualOrder?: string[]): Player[] {
  if (!manualOrder?.length) {
    return [...players].sort(
      (a, b) => (getConsensus(a, state.scoring) ?? 9999) - (getConsensus(b, state.scoring) ?? 9999),
    );
  }
  const index = new Map(manualOrder.map((id, i) => [id, i]));
  return [...players].sort((a, b) => (index.get(a.id) ?? 9999) - (index.get(b.id) ?? 9999));
}

export function renderKeepersTable(container: HTMLElement, opts: KeepersTableOptions): void {
  const keepers = sortKeepers(keeperPlayers(opts.players), opts.manualOrder);
  const locked = getSheetLocked();
  const editable = !locked && opts.mode !== 'live-active';
  const showTeamAssign = opts.mode === 'live-setup' || opts.mode === 'live-active';
  const teamAssignEditable = opts.mode === 'live-setup' && !locked;
  const { teams, slot } = state.draftConfig;
  const defaultTeam = slot - 1;

  const teamOptions = Array.from({ length: teams }, (_, i) => {
    const label = getTeamDisplayName(i);
    return `<option value="${i}">${escapeHtml(label)}</option>`;
  }).join('');

  const thead = `
    <thead><tr>
      <th>#</th>
      <th>Player</th>
      <th>Pos</th>
      <th>Pos rank</th>
      <th>Team</th>
      <th>Consensus</th>
      <th>ADP</th>
      ${showTeamAssign ? '<th>Draft team</th>' : ''}
      <th class="keeper-col" title="Keeper">K</th>
    </tr></thead>`;

  const rows =
    keepers.length === 0
      ? `<tr><td colspan="${showTeamAssign ? 9 : 8}" class="keepers-empty">No keepers marked yet. Check <strong>K</strong> on a player above to add them here.</td></tr>`
      : keepers
          .map((p, i) => {
            const posCls = posCssClass(String(p.pos));
            const injury = p.injuryStatus
              ? `<span class="badge injury" title="${escapeHtml(p.injuryStatus)}">INJ</span>`
              : '';
            const teamIndex = getKeeperTeam(p.id, defaultTeam);
            const draftTeamCell = showTeamAssign
              ? teamAssignEditable
                ? `<td class="keeper-team-cell"><select data-keeper-team="${p.id}" aria-label="Draft team for ${escapeHtml(p.name)}">${teamOptions}</select></td>`
                : `<td>${escapeHtml(getTeamDisplayName(teamIndex))}</td>`
              : '';

            return `<tr class="${posCls} is-keeper" data-id="${p.id}">
        <td>${i + 1}</td>
        <td class="player-name">${escapeHtml(p.name)} ${injury}</td>
        <td><span class="pos-badge ${posCls}">${p.pos}</span></td>
        <td><strong>${formatPosRankLabel(p, opts.scoring)}</strong></td>
        <td>${p.team}</td>
        <td><strong>${getConsensus(p, opts.scoring) ?? '—'}</strong></td>
        <td>${getAdp(p, opts.scoring)?.toFixed(1) ?? '—'}</td>
        ${draftTeamCell}
        <td class="keeper-cell"><input type="checkbox" class="keeper-check" data-keeper="${p.id}" aria-label="Keeper: ${escapeHtml(p.name)}" checked ${editable ? '' : 'disabled'} /></td>
      </tr>`;
          })
          .join('');

  container.innerHTML = `
    <section class="keepers-section">
      <h3 class="keepers-title">Keepers <span class="keepers-count">${keepers.length}</span></h3>
      <div class="table-wrap keepers-table-wrap">
        <table class="keepers-table">${thead}<tbody>${rows}</tbody></table>
      </div>
    </section>`;

  container.querySelectorAll<HTMLSelectElement>('[data-keeper-team]').forEach((sel) => {
    const id = sel.dataset.keeperTeam!;
    sel.value = String(getKeeperTeam(id, defaultTeam));
    sel.addEventListener('change', () => {
      setKeeperTeam(id, Number(sel.value));
      opts.onChange();
    });
  });

  container.querySelectorAll<HTMLInputElement>('[data-keeper]').forEach((box) => {
    if (!editable) return;
    box.addEventListener('change', () => {
      toggleKeeper(box.dataset.keeper!, defaultTeam);
      opts.onChange();
    });
  });
}

export function getKeepersByTeam(allPlayers: Player[]): Map<number, Player[]> {
  const byTeam = new Map<number, Player[]>();
  const defaultTeam = state.draftConfig.slot - 1;
  for (const player of keeperPlayers(allPlayers)) {
    const teamIndex = getKeeperTeam(player.id, defaultTeam);
    if (!byTeam.has(teamIndex)) byTeam.set(teamIndex, []);
    byTeam.get(teamIndex)!.push(player);
  }
  return byTeam;
}
