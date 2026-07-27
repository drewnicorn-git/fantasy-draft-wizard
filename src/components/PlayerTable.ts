import type { Player, ScoringFormat, SourceKey } from '../data/types';
import { SOURCE_LABELS, getAdp, getConsensus, getSourceRank } from '../utils/scoring';
import { isTierBreak, pickPredictor } from '../utils/analytics';
import { loadTags, toggleTag, saveTags } from '../utils/storage';
import { state } from '../state/appState';

export function renderRankingsTable(
  container: HTMLElement,
  players: Player[],
  sources: SourceKey[],
  scoring: ScoringFormat,
  opts: { showPredictor?: boolean; currentPick?: number; picksUntilNext?: number; draftedIds?: Set<string> } = {},
): void {
  const sorted = [...players].sort(
    (a, b) => (getConsensus(a, scoring) ?? 9999) - (getConsensus(b, scoring) ?? 9999),
  );

  const tags = loadTags();

  const thead = `
    <thead><tr>
      <th>#</th><th>Player</th><th>Pos</th><th>Team</th><th>Tier</th>
      ${sources.map((s) => `<th>${SOURCE_LABELS[s] ?? s}</th>`).join('')}
      <th>Cons</th><th>ADP</th>
      ${opts.showPredictor ? '<th>Avail%</th>' : ''}
      <th>Tags</th>
    </tr></thead>`;

  const rows = sorted
    .map((p, i) => {
      const next = sorted[i + 1];
      const tierBreak = isTierBreak(p, next);
      const tag = tags[p.id];
      const injury = p.injuryStatus ? `<span class="badge injury" title="${p.injuryStatus}">INJ</span>` : '';
      const tierCls = p.tier ? `tier-${((p.tier - 1) % 6) + 1}` : '';
      const avail =
        opts.showPredictor && opts.currentPick && opts.picksUntilNext
          ? pickPredictor(p, opts.currentPick, opts.picksUntilNext, scoring)
          : null;

      return `<tr class="${tierCls}${tierBreak ? ' tier-break' : ''}${tag ? ` tag-${tag}` : ''}" data-id="${p.id}">
        <td>${getConsensus(p, scoring) ?? '—'}</td>
        <td class="player-name">${escapeHtml(p.name)} ${injury}</td>
        <td>${p.pos}</td>
        <td>${p.team}</td>
        <td>${p.tier ?? '—'}</td>
        ${sources.map((s) => `<td>${getSourceRank(p, s, scoring) ?? '—'}</td>`).join('')}
        <td><strong>${getConsensus(p, scoring) ?? '—'}</strong></td>
        <td>${getAdp(p, scoring)?.toFixed(1) ?? '—'}</td>
        ${opts.showPredictor ? `<td>${avail != null ? `${avail}%` : '—'}</td>` : ''}
        <td class="tag-btns">
          <button type="button" data-tag="target" data-id="${p.id}" class="${tag === 'target' ? 'active' : ''}">T</button>
          <button type="button" data-tag="avoid" data-id="${p.id}" class="${tag === 'avoid' ? 'active' : ''}">A</button>
          <button type="button" data-tag="sleeper" data-id="${p.id}" class="${tag === 'sleeper' ? 'active' : ''}">S</button>
        </td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `<div class="table-wrap"><table>${thead}<tbody>${rows}</tbody></table></div>`;

  container.querySelectorAll('[data-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      const tag = (btn as HTMLElement).dataset.tag as 'target' | 'avoid' | 'sleeper';
      const next = toggleTag(tags, id, tag);
      saveTags(next);
      renderRankingsTable(container, players, sources, scoring, opts);
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderFilters(container: HTMLElement, onChange: () => void): void {
  const { filters } = state;
  container.innerHTML = `
    <div class="filters">
      <input type="search" id="search" placeholder="Search players…" value="${escapeHtml(filters.search)}" />
      <div class="filter-group">
        <span class="label">Position</span>
        ${['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST']
          .map(
            (p) =>
              `<button type="button" class="chip ${filters.positions.has(p) ? 'active' : ''}" data-pos="${p}">${p}</button>`,
          )
          .join('')}
      </div>
      <div class="filter-group">
        <span class="label">ADP max</span>
        <input type="range" id="adp-max" min="50" max="300" value="${filters.adpMax}" />
        <span id="adp-val">${filters.adpMax >= 300 ? 'All' : filters.adpMax}</span>
      </div>
      <div class="filter-group">
        <span class="label">Tier ≤</span>
        <select id="tier-max">
          <option value="">Any</option>
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => `<option value="${t}" ${filters.tierMax === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <details class="team-filter">
        <summary>Filter by team</summary>
        <div class="team-grid" id="team-grid"></div>
      </details>
    </div>`;

  const search = container.querySelector('#search') as HTMLInputElement;
  search.addEventListener('input', () => {
    state.filters.search = search.value;
    onChange();
  });

  container.querySelectorAll('[data-pos]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pos = (btn as HTMLElement).dataset.pos!;
      if (pos === 'ALL') {
        state.filters.positions = new Set(['ALL']);
      } else {
        state.filters.positions.delete('ALL');
        if (state.filters.positions.has(pos)) state.filters.positions.delete(pos);
        else state.filters.positions.add(pos);
        if (state.filters.positions.size === 0) state.filters.positions.add('ALL');
      }
      renderFilters(container, onChange);
      onChange();
    });
  });

  const adp = container.querySelector('#adp-max') as HTMLInputElement;
  adp.addEventListener('input', () => {
    state.filters.adpMax = Number(adp.value);
    (container.querySelector('#adp-val') as HTMLElement).textContent =
      state.filters.adpMax >= 300 ? 'All' : String(state.filters.adpMax);
    onChange();
  });

  const tier = container.querySelector('#tier-max') as HTMLSelectElement;
  tier.addEventListener('change', () => {
    state.filters.tierMax = tier.value ? Number(tier.value) : null;
    onChange();
  });

  const teamGrid = container.querySelector('#team-grid')!;
  import('../utils/scoring').then(({ NFL_TEAMS }) => {
    teamGrid.innerHTML = NFL_TEAMS.map(
      (t) =>
        `<button type="button" class="chip sm ${state.filters.teams.has(t) ? 'active' : ''}" data-team="${t}">${t}</button>`,
    ).join('');
    teamGrid.querySelectorAll('[data-team]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const team = (btn as HTMLElement).dataset.team!;
        if (state.filters.teams.has(team)) state.filters.teams.delete(team);
        else state.filters.teams.add(team);
        renderFilters(container, onChange);
        onChange();
      });
    });
  });
}
