import type { Player, ScoringFormat, SourceKey } from '../data/types';
import { getActiveSources, getSheetLocked, state } from '../state/appState';
import { SOURCE_LABELS, getAdp, getConsensus, getSourceRank } from '../utils/scoring';
import { formatPickLabel, getUserPickNumbers } from '../sim/snake';
import { formatPosRankLabel, posCssClass } from '../utils/position';
import { formatRankDeltaCell } from '../utils/rankDelta';
import { orderPlayersByManualList, reorderManualIds } from '../utils/manualOrder';
import {
  getTagById,
  loadKeepers,
  loadPlayerTags,
  loadTagDefinitions,
  setPlayerTag,
  toggleKeeper,
} from '../utils/storage';

export interface ManualTableOptions {
  manualOrder: string[];
  sheetRanks: Map<string, number>;
  onManualOrderChange: (order: string[]) => void;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sourceDeltaHeader(source: SourceKey, prefix: 'Δ#' | 'ΔM'): string {
  const short = SOURCE_LABELS[source]?.slice(0, 3) ?? source.slice(0, 3);
  return `<th class="delta-col" title="${prefix} vs ${SOURCE_LABELS[source] ?? source}">${prefix} ${short}</th>`;
}

function attachManualDragDrop(
  tbody: HTMLElement,
  fullOrder: string[],
  onChange: (order: string[]) => void,
): void {
  let dragId: string | null = null;

  tbody.querySelectorAll<HTMLElement>('tr[data-id]').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      dragId = row.dataset.id ?? null;
      row.classList.add('dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      dragId = null;
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetId = row.dataset.id;
      if (!dragId || !targetId || dragId === targetId) return;
      const next = reorderManualIds(fullOrder, dragId, targetId);
      onChange(next);
    });
  });
}

export function renderManualRankingsTable(
  container: HTMLElement,
  players: Player[],
  scoring: ScoringFormat,
  opts: ManualTableOptions,
): void {
  const sources = getActiveSources();
  const tagDefs = loadTagDefinitions();
  const playerTags = loadPlayerTags();
  const keepers = loadKeepers();
  const locked = getSheetLocked();
  const editable = !locked;

  const ordered = orderPlayersByManualList(players, opts.manualOrder);
  const { teams, slot, rounds } = state.draftConfig;
  const userPicks = new Set(getUserPickNumbers(teams, slot, rounds));

  const tagOptions = tagDefs.map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join('');

  const thead = `
    <thead><tr>
      <th class="manual-rank-col" title="Manual rank">Manual #</th>
      <th title="Consensus sheet rank">#</th>
      <th>Player</th>
      <th>Pos</th>
      <th>Pos rank</th>
      <th>Team</th>
      <th>Tier</th>
      ${sources.map((s) => `<th>${SOURCE_LABELS[s] ?? s}</th>`).join('')}
      ${sources.map((s) => sourceDeltaHeader(s, 'Δ#')).join('')}
      ${sources.map((s) => sourceDeltaHeader(s, 'ΔM')).join('')}
      <th title="Manual rank vs sheet rank">ΔM vs #</th>
      <th>Consensus</th>
      <th>ADP</th>
      <th class="keeper-col" title="Keeper">K</th>
      <th>Tag</th>
    </tr></thead>`;

  const rows = ordered
    .map((p, i) => {
      const manualRank = i + 1;
      const sheetRank = opts.sheetRanks.get(p.id) ?? manualRank;
      const isUserPick = userPicks.has(manualRank);
      const pickLabel = isUserPick ? formatPickLabel(manualRank, teams) : '';
      const roundBreak = manualRank % teams === 0;
      const roundLabel = roundBreak ? `R${Math.ceil(manualRank / teams)}` : '';
      const tagId = playerTags[p.id];
      const tagDef = getTagById(tagId, tagDefs);
      const injury = p.injuryStatus ? `<span class="badge injury" title="${escapeHtml(p.injuryStatus)}">INJ</span>` : '';
      const posCls = posCssClass(String(p.pos));
      const tierCls = p.tier ? `tier-${((p.tier - 1) % 6) + 1}` : '';
      const teamWarn = p.teamVerified === false ? ' title="Team not verified on ESPN depth chart"' : '';
      const tagStyle = tagDef ? ` style="--tag-color:${tagDef.color}"` : '';
      const posRankLabel = formatPosRankLabel(p, scoring);
      const isKeeper = keepers.has(p.id);
      const manualVsSheet = formatRankDeltaCell(manualRank, sheetRank);

      return `<tr class="${posCls} ${tierCls}${roundBreak ? ' round-break' : ''}${isUserPick ? ' your-pick' : ''}${tagDef ? ' has-tag' : ''}${isKeeper ? ' is-keeper' : ''} manual-row" data-id="${p.id}" draggable="true"${tagStyle}>
        <td class="manual-rank-col"><span class="drag-handle" aria-hidden="true">⋮⋮</span> ${manualRank}${isUserPick ? `<span class="pick-badge">${pickLabel}</span>` : ''}${roundBreak ? `<span class="round-badge">${roundLabel}</span>` : ''}</td>
        <td>${sheetRank}</td>
        <td class="player-name">${escapeHtml(p.name)} ${injury}</td>
        <td><span class="pos-badge ${posCls}">${p.pos}</span></td>
        <td><strong>${posRankLabel}</strong></td>
        <td${teamWarn}>${p.team}${p.teamVerified === false ? ' *' : ''}</td>
        <td>${p.tier ?? '—'}</td>
        ${sources.map((s) => `<td>${getSourceRank(p, s, scoring) ?? '—'}</td>`).join('')}
        ${sources
          .map((s) => `<td class="delta-col">${formatRankDeltaCell(sheetRank, getSourceRank(p, s, scoring))}</td>`)
          .join('')}
        ${sources
          .map((s) => `<td class="delta-col">${formatRankDeltaCell(manualRank, getSourceRank(p, s, scoring))}</td>`)
          .join('')}
        <td class="delta-col">${manualVsSheet}</td>
        <td><strong>${getConsensus(p, scoring) ?? '—'}</strong></td>
        <td>${getAdp(p, scoring)?.toFixed(1) ?? '—'}</td>
        <td class="keeper-cell"><input type="checkbox" class="keeper-check" data-keeper="${p.id}" aria-label="Keeper: ${escapeHtml(p.name)}" ${isKeeper ? 'checked' : ''} ${editable ? '' : 'disabled'} /></td>
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

  container.innerHTML = `<div class="table-wrap manual-table-wrap"><table class="manual-table">${thead}<tbody>${rows}</tbody></table></div>`;

  const tbody = container.querySelector('tbody') as HTMLElement;
  attachManualDragDrop(tbody, opts.manualOrder, opts.onManualOrderChange);

  container.querySelectorAll<HTMLSelectElement>('[data-player-tag]').forEach((sel) => {
    const id = sel.dataset.playerTag!;
    sel.value = playerTags[id] ?? '';
    if (editable) {
      sel.addEventListener('change', () => {
        setPlayerTag(id, sel.value || null);
        renderManualRankingsTable(container, players, scoring, opts);
      });
    }
  });

  container.querySelectorAll<HTMLInputElement>('[data-keeper]').forEach((box) => {
    if (!editable) return;
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('change', () => {
      toggleKeeper(box.dataset.keeper!);
      renderManualRankingsTable(container, players, scoring, opts);
    });
  });
}
