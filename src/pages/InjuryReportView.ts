import type { InjuryReportEntry } from '../data/types';
import { getInjuries } from '../state/appState';
import { posCssClass } from '../utils/position';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function statusClass(status: string): string {
  const key = status.toLowerCase();
  if (key.includes('out') || key.includes('reserve')) return 'injury-status-out';
  if (key.includes('questionable') || key.includes('doubtful')) return 'injury-status-questionable';
  if (key.includes('suspension')) return 'injury-status-suspension';
  return 'injury-status-other';
}

function renderTable(entries: InjuryReportEntry[]): string {
  if (!entries.length) {
    return '<p class="hint">No ranked players with an injury designation right now.</p>';
  }

  return `
    <div class="table-wrap injury-report-table-wrap">
      <table class="injury-report-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th>Team</th>
            <th>Status</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              (e) => `
            <tr class="${posCssClass(e.pos)}" data-status="${escapeHtml(e.status)}" data-search="${escapeHtml(`${e.name} ${e.team} ${e.pos} ${e.status}`.toLowerCase())}">
              <td class="player-name"><strong>${escapeHtml(e.name)}</strong></td>
              <td><span class="pos-badge ${posCssClass(e.pos)}">${escapeHtml(e.pos)}</span></td>
              <td>${escapeHtml(e.team)}</td>
              <td><span class="injury-status-badge ${statusClass(e.status)}">${escapeHtml(e.status)}</span></td>
              <td class="injury-summary">${escapeHtml(e.summary)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function mountInjuryReportView(root: HTMLElement): void {
  const data = getInjuries();
  if (!data) {
    root.innerHTML = '<p class="error">Injury report data is not available.</p>';
    return;
  }

  const statuses = [...new Set(data.entries.map((e) => e.status))].sort();

  root.innerHTML = `
    <section class="panel injury-report-panel">
      <div class="injury-report-header">
        <div>
          <h2>Injury report</h2>
          <p class="hint">${data.entries.length} ranked player${data.entries.length === 1 ? '' : 's'} with a designation · Updated ${new Date(data.fetchedAt ?? data.builtAt).toLocaleString()}</p>
        </div>
        <div class="injury-report-filters">
          <label class="injury-search-label" for="injury-search">Search</label>
          <input type="search" id="injury-search" class="player-search-input" placeholder="Filter players…" autocomplete="off" />
          <label class="injury-status-filter-label" for="injury-status-filter">Status</label>
          <select id="injury-status-filter" class="injury-status-filter">
            <option value="">All statuses</option>
            ${statuses.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="injury-report-table">${renderTable(data.entries)}</div>
    </section>`;

  const searchEl = root.querySelector('#injury-search') as HTMLInputElement;
  const statusEl = root.querySelector('#injury-status-filter') as HTMLSelectElement;
  const tbody = root.querySelector('.injury-report-table tbody') as HTMLElement;

  const applyFilters = (): void => {
    const q = searchEl.value.trim().toLowerCase();
    const status = statusEl.value;
    tbody.querySelectorAll('tr').forEach((row) => {
      const el = row as HTMLElement;
      const matchSearch = !q || (el.dataset.search ?? '').includes(q);
      const matchStatus = !status || el.dataset.status === status;
      el.classList.toggle('hidden', !(matchSearch && matchStatus));
    });
  };

  searchEl.addEventListener('input', applyFilters);
  statusEl.addEventListener('change', applyFilters);
}
