import type { Player, ScoringFormat, SourceKey } from '../data/types';

import { getActiveSources, getSheetLocked, state } from '../state/appState';

import { SOURCE_LABELS, getAdp, getConsensus, getSourceRank } from '../utils/scoring';

import { pickPredictor } from '../utils/analytics';

import { formatPickLabel, isProjectedRoundBreak, isUserProjectedPick, projectedPickOverall, roundFromOverall } from '../sim/snake';

import { formatPosRankLabel, getPosRankValue, posCssClass, posSortOrder } from '../utils/position';

import {

  addCustomTag,

  getTagById,

  loadPlayerTags,

  loadTagDefinitions,

  loadKeepers,

  removeCustomTag,

  setPlayerTag,

  toggleKeeper,

} from '../utils/storage';

import { getManualRank, setManualRank } from '../utils/manualOrder';

import {

  availableRankMetrics,

  getPlayerRankDelta,

  getPlayerRankMetric,

  loadRankDeltaCompare,

  rankMetricLabel,

  saveRankDeltaCompare,

  type RankMetric,

} from '../utils/rankCompare';

import { formatRankDeltaCell } from '../utils/rankDelta';



type SortKey =

  | 'consensus'

  | 'name'

  | 'pos'

  | 'team'

  | 'tier'

  | 'posRank'

  | 'adp'

  | 'avail'

  | 'manual'

  | 'delta'

  | `source:${SourceKey}`;



interface SortState {

  key: SortKey;

  dir: 'asc' | 'desc';

}



let tableSort: SortState = { key: 'consensus', dir: 'asc' };



const DEFAULT_SORT_DIR: Record<SortKey, 'asc' | 'desc'> = {

  consensus: 'asc',

  name: 'asc',

  pos: 'asc',

  team: 'asc',

  tier: 'asc',

  posRank: 'asc',

  adp: 'asc',

  avail: 'desc',

  manual: 'asc',

  delta: 'asc',

  'source:fantasypros': 'asc',

  'source:espn': 'asc',

  'source:sleeper': 'asc',

  'source:yahoo': 'asc',

  'source:nfl': 'asc',

};



function sortHeader(label: string, key: SortKey, sort: SortState): string {

  const active = sort.key === key;

  const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';

  const aria = active ? sort.dir : 'none';

  return `<th class="sortable${active ? ' sorted' : ''}" data-sort="${key}" role="columnheader" aria-sort="${aria}" tabindex="0">${label}${arrow}</th>`;

}



function renderDeltaCompareHeader(

  metrics: RankMetric[],

  compare: { from: RankMetric; to: RankMetric },

  sort: SortState,

): string {

  const active = sort.key === 'delta';

  const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';

  const aria = active ? sort.dir : 'none';

  const option = (selected: RankMetric): string =>

    metrics.map((m) => `<option value="${m}" ${m === selected ? 'selected' : ''}>${rankMetricLabel(m)}</option>`).join('');



  return `<th class="sortable delta-compare-col${active ? ' sorted' : ''}" data-sort="delta" role="columnheader" aria-sort="${aria}" tabindex="0">

    <div class="delta-compare-header">

      <select class="delta-metric-select" data-delta-from aria-label="Compare rank from">${option(compare.from)}</select>

      <span class="delta-arrow">−</span>

      <select class="delta-metric-select" data-delta-to aria-label="Compare rank to">${option(compare.to)}</select>

      <span class="delta-sort-label">Δ${arrow}</span>

    </div>

  </th>`;

}



function compareNullable(a: number | null, b: number | null, dir: 'asc' | 'desc'): number {

  const av = a ?? (dir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);

  const bv = b ?? (dir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);

  return dir === 'asc' ? av - bv : bv - av;

}



function sortPlayers(

  players: Player[],

  scoring: ScoringFormat,

  sort: SortState,

  opts: { showPredictor?: boolean; currentPick?: number; picksUntilNext?: number },

  rankDeltaCompare: { from: RankMetric; to: RankMetric },

): Player[] {

  const dir = sort.dir;

  const list = [...players];



  list.sort((a, b) => {

    let cmp = 0;

    switch (sort.key) {

      case 'consensus':

        cmp = compareNullable(getConsensus(a, scoring), getConsensus(b, scoring), dir);

        break;

      case 'name':

        cmp = dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);

        break;

      case 'pos': {

        const pa = posSortOrder(String(a.pos));

        const pb = posSortOrder(String(b.pos));

        cmp = dir === 'asc' ? pa - pb : pb - pa;

        if (cmp === 0) cmp = a.name.localeCompare(b.name);

        break;

      }

      case 'team':

        cmp = dir === 'asc' ? a.team.localeCompare(b.team) : b.team.localeCompare(a.team);

        break;

      case 'tier':

        cmp = compareNullable(a.tier, b.tier, dir);

        break;

      case 'posRank':

        cmp = compareNullable(getPosRankValue(a, scoring), getPosRankValue(b, scoring), dir);

        break;

      case 'adp':

        cmp = compareNullable(getAdp(a, scoring), getAdp(b, scoring), dir);

        break;

      case 'avail': {

        const av =

          opts.showPredictor && opts.currentPick && opts.picksUntilNext

            ? pickPredictor(a, opts.currentPick, opts.picksUntilNext, scoring)

            : null;

        const bv =

          opts.showPredictor && opts.currentPick && opts.picksUntilNext

            ? pickPredictor(b, opts.currentPick, opts.picksUntilNext, scoring)

            : null;

        cmp = compareNullable(av, bv, dir);

        break;

      }

      case 'manual':

        cmp = compareNullable(getManualRank(scoring, a.id), getManualRank(scoring, b.id), dir);

        break;

      case 'delta':

        cmp = compareNullable(

          getPlayerRankDelta(a, rankDeltaCompare.from, rankDeltaCompare.to, scoring),

          getPlayerRankDelta(b, rankDeltaCompare.from, rankDeltaCompare.to, scoring),

          dir,

        );

        break;

      default:

        if (sort.key.startsWith('source:')) {

          const source = sort.key.slice(7) as SourceKey;

          cmp = compareNullable(getSourceRank(a, source, scoring), getSourceRank(b, source, scoring), dir);

        }

        break;

    }

    if (cmp === 0) {

      cmp = compareNullable(getConsensus(a, scoring), getConsensus(b, scoring), 'asc');

    }

    return cmp;

  });



  return list;

}



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

    draftOverall?: number;

    onKeeperChange?: () => void;

    onManualRankChange?: () => void;

  } = {},

): void {

  const sources = getActiveSources();

  const tagDefs = loadTagDefinitions();

  const playerTags = loadPlayerTags();

  const keepers = loadKeepers();

  const locked = getSheetLocked();

  const editable = !locked && opts.mode !== 'mock-draft';

  const rankMetrics = availableRankMetrics(sources);

  const rankDeltaCompare = loadRankDeltaCompare(sources);



  const sorted = sortPlayers(players, scoring, tableSort, opts, rankDeltaCompare);



  const isMockDraft = opts.mode === 'mock-draft';

  const showPredictorCol = opts.showPredictor || isMockDraft;

  const showSources = !isMockDraft;

  const showTags = !isMockDraft;

  const showKeepers = !isMockDraft;

  const showManualCol = !isMockDraft;

  const showDeltaCol = rankMetrics.length >= 2;

  const showPickSpots = !showPredictorCol && !isMockDraft;

  const { teams, slot, rounds } = state.draftConfig;

  const draftOverall = opts.draftOverall ?? 1;



  const tagOptions = tagDefs

    .map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`)

    .join('');



  const thead = `

    <thead><tr>

      <th>#</th>

      ${showManualCol ? sortHeader('Manual', 'manual', tableSort) : ''}

      ${sortHeader('Player', 'name', tableSort)}

      ${sortHeader('Pos', 'pos', tableSort)}

      ${sortHeader('Pos rank', 'posRank', tableSort)}

      ${sortHeader('Team', 'team', tableSort)}

      ${sortHeader('Tier', 'tier', tableSort)}

      ${showSources ? sources.map((s) => sortHeader(SOURCE_LABELS[s] ?? s, `source:${s}`, tableSort)).join('') : ''}

      ${showDeltaCol ? renderDeltaCompareHeader(rankMetrics, rankDeltaCompare, tableSort) : ''}

      ${sortHeader('Consensus', 'consensus', tableSort)}

      ${sortHeader('ADP', 'adp', tableSort)}

      ${showPredictorCol ? sortHeader('Avail%', 'avail', tableSort) : ''}

      ${showKeepers ? '<th class="keeper-col" title="Keeper">K</th>' : ''}

      ${showTags ? '<th>Tag</th>' : ''}

    </tr></thead>`;



  const rows = sorted

    .map((p, i) => {

      const overallRank = i + 1;

      const manualRank = getManualRank(scoring, p.id);

      const rankForPicks = manualRank ?? overallRank;

      const projectedOverall = projectedPickOverall(rankForPicks, draftOverall);

      const isUserPick = showPickSpots && isUserProjectedPick(rankForPicks, draftOverall, teams, slot, rounds);

      const pickLabel = isUserPick ? formatPickLabel(projectedOverall, teams) : '';

      const roundBreak = showPickSpots && isProjectedRoundBreak(rankForPicks, draftOverall, teams);

      const roundLabel = roundBreak ? `R${roundFromOverall(projectedOverall, teams).round}` : '';

      const tagId = playerTags[p.id];

      const tagDef = getTagById(tagId, tagDefs);

      const injury = p.injuryStatus ? `<span class="badge injury" title="${escapeHtml(p.injuryStatus)}">INJ</span>` : '';

      const posCls = posCssClass(String(p.pos));

      const tierCls = p.tier ? `tier-${((p.tier - 1) % 6) + 1}` : '';

      const teamWarn = p.teamVerified === false ? ' title="Team not verified on ESPN depth chart"' : '';

      const avail =

        opts.showPredictor && opts.currentPick && opts.picksUntilNext

          ? pickPredictor(p, opts.currentPick, opts.picksUntilNext, scoring)

          : null;

      const tagStyle = tagDef ? ` style="--tag-color:${tagDef.color}"` : '';

      const posRankLabel = formatPosRankLabel(p, scoring);

      const isKeeper = keepers.has(p.id);

      const fromRank = getPlayerRankMetric(p, rankDeltaCompare.from, scoring);

      const toRank = getPlayerRankMetric(p, rankDeltaCompare.to, scoring);

      const deltaCell =

        fromRank != null && toRank != null ? formatRankDeltaCell(fromRank, toRank) : '—';



      return `<tr class="${posCls} ${tierCls}${roundBreak ? ' round-break' : ''}${isUserPick ? ' your-pick' : ''}${tagDef ? ' has-tag' : ''}${opts.mode === 'live-draft' ? ' pickable' : ''}" data-id="${p.id}"${tagStyle}>

        <td>${overallRank}${isUserPick ? `<span class="pick-badge">${pickLabel}</span>` : ''}${roundBreak ? `<span class="round-badge">${roundLabel}</span>` : ''}</td>

        ${showManualCol ? `<td class="manual-rank-cell"><input type="number" class="manual-rank-input" data-manual-rank="${p.id}" aria-label="Manual rank for ${escapeHtml(p.name)}" value="${manualRank ?? ''}" placeholder="—" min="1" max="999" ${editable ? '' : 'disabled'} /></td>` : ''}

        <td class="player-name">${escapeHtml(p.name)} ${injury}</td>

        <td><span class="pos-badge ${posCls}">${p.pos}</span></td>

        <td><strong>${posRankLabel}</strong></td>

        <td${teamWarn}>${p.team}${p.teamVerified === false ? ' *' : ''}</td>

        <td>${p.tier ?? '—'}</td>

        ${showSources ? sources.map((s) => `<td>${getSourceRank(p, s, scoring) ?? '—'}</td>`).join('') : ''}

        ${showDeltaCol ? `<td class="delta-col">${deltaCell}</td>` : ''}

        <td><strong>${getConsensus(p, scoring) ?? '—'}</strong></td>

        <td>${getAdp(p, scoring)?.toFixed(1) ?? '—'}</td>

        ${showPredictorCol ? `<td>${avail != null ? `${avail}%` : '—'}</td>` : ''}

        ${showKeepers ? `<td class="keeper-cell"><input type="checkbox" class="keeper-check" data-keeper="${p.id}" aria-label="Keeper: ${escapeHtml(p.name)}" ${isKeeper ? 'checked' : ''} ${editable ? '' : 'disabled'} /></td>` : ''}

        ${showTags ? `<td class="tag-cell">

          <select data-player-tag="${p.id}" aria-label="Tag for ${escapeHtml(p.name)}" ${editable ? '' : 'disabled'}>

            <option value="">—</option>

            ${tagOptions}

          </select>

          ${tagDef ? `<span class="tag-pill" style="background:${tagDef.color}">${escapeHtml(tagDef.label)}</span>` : ''}

        </td>` : ''}

      </tr>`;

    })

    .join('');



  container.innerHTML = `<div class="table-wrap"><table>${thead}<tbody>${rows}</tbody></table></div>`;



  container.querySelectorAll<HTMLElement>('th.sortable[data-sort]').forEach((th) => {

    const activate = (): void => {

      const key = th.dataset.sort as SortKey;

      if (tableSort.key === key) {

        tableSort = { key, dir: tableSort.dir === 'asc' ? 'desc' : 'asc' };

      } else {

        tableSort = { key, dir: DEFAULT_SORT_DIR[key] ?? 'asc' };

      }

      renderRankingsTable(container, players, scoring, opts);

    };

    th.addEventListener('click', (e) => {

      if ((e.target as HTMLElement).closest('.delta-metric-select')) return;

      activate();

    });

    th.addEventListener('keydown', (e) => {

      if (e.key === 'Enter' || e.key === ' ') {

        e.preventDefault();

        activate();

      }

    });

  });



  container.querySelectorAll<HTMLSelectElement>('[data-delta-from], [data-delta-to]').forEach((sel) => {

    if (!showDeltaCol) return;

    sel.addEventListener('click', (e) => e.stopPropagation());

    sel.addEventListener('change', () => {

      const fromSel = container.querySelector('[data-delta-from]') as HTMLSelectElement;

      const toSel = container.querySelector('[data-delta-to]') as HTMLSelectElement;

      let from = fromSel.value as RankMetric;

      let to = toSel.value as RankMetric;

      if (from === to) {

        const alt = rankMetrics.find((m) => m !== from);

        if (alt) to = alt;

        toSel.value = to;

      }

      saveRankDeltaCompare({ from, to });

      tableSort = { key: 'delta', dir: 'asc' };

      renderRankingsTable(container, players, scoring, opts);

    });

  });



  container.querySelectorAll<HTMLSelectElement>('[data-player-tag]').forEach((sel) => {

    if (!showTags) return;

    const id = sel.dataset.playerTag!;

    sel.value = playerTags[id] ?? '';

    if (editable) {

      sel.addEventListener('change', () => {

        setPlayerTag(id, sel.value || null);

        renderRankingsTable(container, players, scoring, opts);

      });

    }

  });



  container.querySelectorAll<HTMLInputElement>('[data-manual-rank]').forEach((input) => {

    if (!showManualCol || !editable) return;

    input.addEventListener('click', (e) => e.stopPropagation());

    const save = (): void => {

      const raw = input.value.trim();

      const rank = raw === '' ? null : Number(raw);

      setManualRank(scoring, input.dataset.manualRank!, rank != null && Number.isFinite(rank) ? rank : null);

      if (opts.onManualRankChange) opts.onManualRankChange();

      else renderRankingsTable(container, players, scoring, opts);

    };

    input.addEventListener('change', save);

    input.addEventListener('keydown', (e) => {

      if (e.key === 'Enter') {

        e.preventDefault();

        input.blur();

      }

    });

  });



  container.querySelectorAll<HTMLInputElement>('[data-keeper]').forEach((box) => {

    if (!showKeepers || !editable) return;

    box.addEventListener('click', (e) => e.stopPropagation());

    box.addEventListener('change', () => {

      toggleKeeper(box.dataset.keeper!, state.draftConfig.slot - 1);

      if (opts.onKeeperChange) opts.onKeeperChange();

      else renderRankingsTable(container, players, scoring, opts);

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


