import type { Player, ScoringFormat } from '../data/types';
import { getActiveSources, getSheetLocked, setTierOverride, state } from '../state/appState';
import { SOURCE_LABELS, getAdp, getConsensus, getSourceRank } from '../utils/scoring';
import { pickPredictor } from '../utils/analytics';
import { formatPickLabel, getUserPickNumbers } from '../sim/snake';
import {
  addCustomTag,
  getTagById,
  loadPlayerTags,
  loadTagDefinitions,
  removeCustomTag,
  setPlayerTag,
} from '../utils/storage';

export function renderRankingsTable(
  container: HTMLElement,
  players: Player[],
  scoring: ScoringFormat,
  opts: {
    showPredictor?: boolean;
    currentPick?: number;
    picksUntilNext?: number;
    draftedIds?: Set<string>;
    mode?: 'rankings' | 'live-draft' | 'mock-draft';
    onPlayerPick?: (playerId: string) => void;
  } = {},
): void {
  const sources = getActiveSources();
  const tagDefs = loadTagDefinitions();
  const playerTags = loadPlayerTags();
  const locked = getSheetLocked();
  const editable = !locked && opts.mode !== 'mock-draft';

  const sorted = [...players].sort((a, b) => (getConsensus(a, scoring) ?? 9999) - (getConsensus(b, scoring) ?? 9999));

  const showPickSpots = !opts.showPredictor && opts.mode !== 'mock-draft';
  const { teams, slot, rounds } = state.draftConfig;
  const userPicks = showPickSpots ? new Set(getUserPickNumbers(teams, slot, rounds)) : new Set<number>();

  const tagOptions = tagDefs
    .map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`)
    .join('');

  const thead = `
    <thead><tr>
      <th>#</th><th>Player</th><th>Pos</th><th>Team</th><th>Tier</th>
      ${sources.map((s) => `<th>${SOURCE_LABELS[s] ?? s}</th>`).join('')}
      <th>Consensus</th><th>ADP</th>
      ${opts.showPredictor ? '<th>Avail%</th>' : ''}
      <th>Tag</th>
    </tr></thead>`;

  const rows = sorted
    .map((p, i) => {
      const overallRank = i + 1;
      const isUserPick = userPicks.has(overallRank);
      const pickLabel = isUserPick ? formatPickLabel(overallRank, teams) : '';
      const roundBreak = showPickSpots && overallRank % teams === 0;
      const roundLabel = roundBreak ? `R${overallRank / teams}` : '';
      const tagId = playerTags[p.id];
      const tagDef = getTagById(tagId, tagDefs);
      const injury = p.injuryStatus ? `<span class="badge injury" title="${escapeHtml(p.injuryStatus)}">INJ</span>` : '';
      const tierCls = p.tier ? `tier-${((p.tier - 1) % 6) + 1}` : '';
      const teamWarn = p.teamVerified === false ? ' title="Team not verified on ESPN depth chart"' : '';
      const avail =
        opts.showPredictor && opts.currentPick && opts.picksUntilNext
          ? pickPredictor(p, opts.currentPick, opts.picksUntilNext, scoring)
          : null;
      const tagStyle = tagDef ? ` style="--tag-color:${tagDef.color}"` : '';

      return `<tr class="${tierCls}${roundBreak ? ' round-break' : ''}${isUserPick ? ' your-pick' : ''}${tagDef ? ' has-tag' : ''}${opts.mode === 'live-draft' ? ' pickable' : ''}" data-id="${p.id}"${tagStyle}>
        <td>${overallRank}${isUserPick ? `<span class="pick-badge">${pickLabel}</span>` : ''}${roundBreak ? `<span class="round-badge">${roundLabel}</span>` : ''}</td>
        <td class="player-name">${escapeHtml(p.name)} ${injury}</td>
        <td>${p.pos}</td>
        <td${teamWarn}>${p.team}${p.teamVerified === false ? ' *' : ''}</td>
        <td>${
          editable
            ? `<input type="number" class="tier-input" data-tier-player="${p.id}" min="1" max="20" value="${p.tier ?? ''}" placeholder="—" />`
            : (p.tier ?? '—')
        }</td>
        ${sources.map((s) => `<td>${getSourceRank(p, s, scoring) ?? '—'}</td>`).join('')}
        <td><strong>${getConsensus(p, scoring) ?? '—'}</strong></td>
        <td>${getAdp(p, scoring)?.toFixed(1) ?? '—'}</td>
        ${opts.showPredictor ? `<td>${avail != null ? `${avail}%` : '—'}</td>` : ''}
        <td class="tag-cell">
          <select data-player-tag="${p.id}" aria-label="Tag for ${escapeHtml(p.name)}" ${editable ? '' : 'disabled'}>
            <option value="">—</option>
            ${tagOptions}
          </select>
          ${tagDef ? `<span class="tag-pill" style="background:${tagDef.color}">${escapeHtml(tagDef.label)}</span>` : ''}
        </td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `<div class="table-wrap"><table>${thead}<tbody>${rows}</tbody></table></div>`;

  container.querySelectorAll<HTMLSelectElement>('[data-player-tag]').forEach((sel) => {
    const id = sel.dataset.playerTag!;
    sel.value = playerTags[id] ?? '';
    if (editable) {
      sel.addEventListener('change', () => {
        setPlayerTag(id, sel.value || null);
        renderRankingsTable(container, players, scoring, opts);
      });
    }
  });

  container.querySelectorAll<HTMLInputElement>('[data-tier-player]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.tierPlayer!;
      const val = input.value.trim();
      setTierOverride(id, val ? Number(val) : null);
      renderRankingsTable(container, players, scoring, opts);
    });
  });

  if (opts.mode === 'live-draft' && opts.onPlayerPick) {
    container.querySelectorAll('tr.pickable[data-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('select, input')) return;
        opts.onPlayerPick!((row as HTMLElement).dataset.id!);
      });
    });
  }
}

export function renderTagManager(container: HTMLElement, onChange: () => void): void {
  const tagDefs = loadTagDefinitions();
  const locked = getSheetLocked();

  container.innerHTML = `
    <details class="tag-manager">
      <summary>Tags — label players for your draft</summary>
      <p class="hint">Preset tags: <strong>Target</strong> (want to draft), <strong>Avoid</strong> (skip), <strong>Sleeper</strong> (undervalued). Create custom tags below.</p>
      <ul class="tag-def-list">
        ${tagDefs
          .map(
            (t) => `
          <li>
            <span class="tag-pill" style="background:${t.color}">${escapeHtml(t.label)}</span>
            <span class="muted">${escapeHtml(t.description ?? '')}</span>
            ${t.preset ? '<span class="badge preset">preset</span>' : locked ? '' : `<button type="button" class="btn sm" data-remove-tag="${t.id}">Remove</button>`}
          </li>`,
          )
          .join('')}
      </ul>
      ${locked ? '' : `<form id="add-tag-form" class="add-tag-form">
        <input type="text" id="new-tag-label" placeholder="Custom tag name" maxlength="24" required />
        <input type="color" id="new-tag-color" value="#3d8bfd" title="Tag color" />
        <button type="submit" class="btn secondary sm">Add tag</button>
      </form>`}
      ${locked ? '<p class="hint muted">Sheet is locked — click Edit sheet in the toolbar to change tags.</p>' : ''}
    </details>`;

  container.querySelectorAll('[data-remove-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeCustomTag((btn as HTMLElement).dataset.removeTag!);
      renderTagManager(container, onChange);
      onChange();
    });
  });

  container.querySelector('#add-tag-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = (container.querySelector('#new-tag-label') as HTMLInputElement).value.trim();
    const color = (container.querySelector('#new-tag-color') as HTMLInputElement).value;
    if (label) {
      addCustomTag(label, color);
      renderTagManager(container, onChange);
      onChange();
    }
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
