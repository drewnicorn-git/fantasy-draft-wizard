import type { DepthChartsData } from '../data/types';
import { getDepthCharts } from '../state/appState';
import { DEPTH_CHART_POSITIONS, NFL_TEAMS_SORTED } from '../utils/depthChart';
import { posCssClass } from '../utils/position';
import { rankingsUpdatedAt } from '../utils/rankingsMeta';

const STORAGE_KEY = 'fdw-depth-team';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadSelectedTeam(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && NFL_TEAMS_SORTED.includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  return NFL_TEAMS_SORTED[0] ?? 'ARI';
}

function saveSelectedTeam(team: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, team);
  } catch {
    /* ignore */
  }
}

function maxDepthSlots(teamChart: Partial<Record<(typeof DEPTH_CHART_POSITIONS)[number], string[]>>): number {
  return Math.max(0, ...DEPTH_CHART_POSITIONS.map((pos) => teamChart[pos]?.length ?? 0));
}

function renderDepthTable(data: DepthChartsData, team: string): string {
  const teamChart = data.teams[team] ?? {};
  const maxDepth = maxDepthSlots(teamChart);
  if (!maxDepth) {
    return '<p class="hint">No depth chart data for this team.</p>';
  }

  const depthHeaders = Array.from({ length: maxDepth }, (_, i) => `<th>Depth ${i + 1}</th>`).join('');

  const rows = DEPTH_CHART_POSITIONS.map((pos) => {
    const players = teamChart[pos] ?? [];
    const cells = Array.from({ length: maxDepth }, (_, i) => {
      const name = players[i];
      return `<td>${name ? escapeHtml(name) : '—'}</td>`;
    }).join('');
    return `
      <tr class="${posCssClass(pos)}">
        <th scope="row"><span class="pos-badge ${posCssClass(pos)}">${pos}</span></th>
        ${cells}
      </tr>`;
  }).join('');

  return `
    <div class="table-wrap depth-chart-table-wrap">
      <table class="depth-chart-table">
        <thead>
          <tr>
            <th scope="col">Position</th>
            ${depthHeaders}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function mountDepthChartsView(root: HTMLElement): void {
  const data = getDepthCharts();
  if (!data) {
    root.innerHTML = `
      <section class="panel depth-charts-panel">
        <p class="hint">Depth chart data is not available. Run <code>npm run update:rankings</code> to refresh.</p>
      </section>`;
    return;
  }

  let selectedTeam = loadSelectedTeam();
  if (!data.teams[selectedTeam]) {
    selectedTeam = NFL_TEAMS_SORTED.find((t) => data.teams[t]) ?? NFL_TEAMS_SORTED[0];
  }

  const updated = rankingsUpdatedAt(data);

  root.innerHTML = `
    <section class="panel depth-charts-panel">
      <div class="depth-charts-header">
        <div>
          <h2>Depth charts</h2>
          <p class="hint">ESPN team depth charts · ${updated ? `Updated ${new Date(updated).toLocaleString()}` : 'Update time unavailable'}</p>
        </div>
        <label class="depth-charts-team-label" for="depth-charts-team">Team</label>
        <select id="depth-charts-team" class="depth-charts-team-select" aria-label="Select NFL team">
          ${NFL_TEAMS_SORTED.map(
            (team) => `<option value="${team}" ${team === selectedTeam ? 'selected' : ''}>${team}</option>`,
          ).join('')}
        </select>
      </div>
      <div id="depth-charts-table">${renderDepthTable(data, selectedTeam)}</div>
    </section>`;

  const tableHost = root.querySelector('#depth-charts-table') as HTMLElement;
  const select = root.querySelector('#depth-charts-team') as HTMLSelectElement;

  select.addEventListener('change', () => {
    selectedTeam = select.value;
    saveSelectedTeam(selectedTeam);
    tableHost.innerHTML = renderDepthTable(data, selectedTeam);
  });
}
