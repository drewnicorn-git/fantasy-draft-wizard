import type { InjuryReportEntry } from '../data/types';
import { getInjuries } from '../state/appState';
import { posCssClass } from '../utils/position';
import { escapeHtml } from '../utils/escapeHtml';

type SortKey = 'name' | 'pos' | 'team' | 'status';
type SortDir = 'asc' | 'desc';

interface SortState {
  key: SortKey;
  dir: SortDir;
}

const STATUS_SORT: Record<string, number> = {
  Out: 0,
  Doubtful: 1,
  Questionable: 2,
  'Injured Reserve': 3,
  Suspension: 4,
};

const POS_ORDER: Record<string, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
  K: 4,
};

function statusClass(status: string): string {
  const key = status.toLowerCase();
  if (key.includes('out') || key.includes('reserve')) return 'injury-status-out';
  if (key.includes('questionable') || key.includes('doubtful')) return 'injury-status-questionable';
  if (key.includes('suspension')) return 'injury-status-suspension';
  return 'injury-status-other';
}

function sortHeader(label: string, key: SortKey, sort: SortState): string {
  const active = sort.key === key;
  const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
  const aria = active ? sort.dir : 'none';
  return `<th class="sortable${active ? ' sorted' : ''}" data-sort="${key}" role="columnheader" aria-sort="${aria}" tabindex="0">${label}${arrow}</th>`;
}

function sortEntries(entries: InjuryReportEntry[], sort: SortState): InjuryReportEntry[] {
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    let cmp = 0;
    switch (sort.key) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'pos':
        cmp = (POS_ORDER[a.pos] ?? 99) - (POS_ORDER[b.pos] ?? 99) || a.name.localeCompare(b.name);
        break;
      case 'team':
        cmp = a.team.localeCompare(b.team) || a.name.localeCompare(b.name);
        break;
      case 'status':
        cmp = (STATUS_SORT[a.status] ?? 99) - (STATUS_SORT[b.status] ?? 99) || a.name.localeCompare(b.name);
        break;
    }
    return cmp * mul;
  });
}

function filterEntries(entries: InjuryReportEntry[], query: string, status: string): InjuryReportEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    const matchSearch =
      !q || `${e.name} ${e.team} ${e.pos} ${e.status}`.toLowerCase().includes(q);
    const matchStatus = !status || e.status === status;
    return matchSearch && matchStatus;
  });
}

function renderRows(entries: InjuryReportEntry[]): string {
  if (!entries.length) {
    return '<tr><td colspan="5" class="hint">No players match the current filters.</td></tr>';
  }

  return entries
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
    .join('');
}

function renderTable(entries: InjuryReportEntry[], sort: SortState): string {
  return `
    <div class="table-wrap injury-report-table-wrap">
      <table class="injury-report-table">
        <thead>
          <tr>
            ${sortHeader('Player', 'name', sort)}
            ${sortHeader('Pos', 'pos', sort)}
            ${sortHeader('Team', 'team', sort)}
            ${sortHeader('Status', 'status', sort)}
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>${renderRows(entries)}</tbody>
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
  let sort: SortState = { key: 'status', dir: 'asc' };

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
      <div id="injury-report-table"></div>
    </section>`;

  const tableHost = root.querySelector('#injury-report-table') as HTMLElement;
  const searchEl = root.querySelector('#injury-search') as HTMLInputElement;
  const statusEl = root.querySelector('#injury-status-filter') as HTMLSelectElement;

  const updateTable = (): void => {
    if (!data.entries.length) {
      tableHost.innerHTML =
        '<p class="hint">No ranked players with an injury designation right now.</p>';
      return;
    }

    const visible = filterEntries(data.entries, searchEl.value, statusEl.value);
    const sorted = sortEntries(visible, sort);
    tableHost.innerHTML = renderTable(sorted, sort);

    tableHost.querySelectorAll<HTMLElement>('th.sortable[data-sort]').forEach((th) => {
      const activate = (): void => {
        const key = th.dataset.sort as SortKey;
        if (sort.key === key) {
          sort = { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
        } else {
          sort = { key, dir: 'asc' };
        }
        updateTable();
      };

      th.addEventListener('click', activate);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });
  };

  searchEl.addEventListener('input', updateTable);
  statusEl.addEventListener('change', updateTable);
  updateTable();
}
