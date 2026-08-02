import type { DraftPick, DraftConfig, Player } from '../data/types';

import { getTeamDisplayName } from './TeamNamesEditor';

import { posCssClass } from '../utils/position';



export function renderDraftBoard(

  container: HTMLElement,

  picks: DraftPick[],

  config: DraftConfig,

  userSlot: number,

  teamNames?: string[],

  opts: { maxRound?: number; title?: string; keepersByTeam?: Map<number, Player[]> } = {},
): void {
  const { teams, rounds } = config;
  const names = teamNames ?? Array.from({ length: teams }, (_, i) => getTeamDisplayName(i));
  const roundsToShow = Math.min(opts.maxRound ?? rounds, rounds);
  const title = opts.title ?? 'Draft Board';
  const keepersByTeam = opts.keepersByTeam ?? new Map<number, Player[]>();
  const hasKeepers = [...keepersByTeam.values()].some((list) => list.length > 0);
  const bodyRows = roundsToShow + (hasKeepers ? 1 : 0);
  const densityClass = bodyRows >= 16 ? 'draft-board-compact' : bodyRows >= 13 ? 'draft-board-dense' : '';

  let html = `<div class="draft-board-shell"><h3 class="draft-board-title">${escapeHtml(title)}</h3><div class="draft-board ${densityClass}" data-rows="${bodyRows}"><table><thead><tr><th>Round</th>`;
  for (let t = 1; t <= teams; t++) {
    const label = t === userSlot ? `You (${names[t - 1]})` : names[t - 1];
    html += `<th class="${t === userSlot ? 'user-col' : ''}">${escapeHtml(label)}</th>`;
  }
  html += '</tr></thead><tbody>';

  if (hasKeepers) {
    html += '<tr class="keeper-board-row"><td class="round-num keeper-label">K</td>';
    for (let t = 0; t < teams; t++) {
      const list = keepersByTeam.get(t) ?? [];
      const userCls = t + 1 === userSlot ? 'user-col' : '';
      const cells = list.length
        ? `<div class="keeper-board-picks">${list
            .map((p) => {
              const posCls = posCssClass(String(p.pos));
              return `<span class="keeper-board-pick ${posCls}"><span class="pick-pos pos-badge ${posCls}">${p.pos}</span> ${escapeHtml(p.name)}</span>`;
            })
            .join('')}</div>`
        : '—';
      html += `<td class="draft-pick-cell keeper-cell ${userCls}">${cells}</td>`;
    }
    html += '</tr>';
  }
  for (let r = 1; r <= roundsToShow; r++) {

    html += `<tr><td class="round-num">R${r}</td>`;

    for (let t = 1; t <= teams; t++) {

      const pick = picks.find((p) => p.round === r && p.teamIndex === t - 1);

      const userCls = t === userSlot ? 'user-col' : '';

      if (pick) {

        const posCls = posCssClass(pick.pos);

        html += `<td class="draft-pick-cell ${userCls} ${posCls}"><span class="pick-pos pos-badge ${posCls}">${pick.pos}</span> ${escapeHtml(pick.playerName)}</td>`;

      } else {

        html += `<td class="draft-pick-cell empty ${userCls}">—</td>`;

      }

    }

    html += '</tr>';

  }

  html += '</tbody></table></div></div>';

  container.innerHTML = html;

}



function escapeHtml(s: string): string {

  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

}



export function renderRosterSummary(container: HTMLElement, roster: { name: string; pos: string; team: string; adp: number | null }[]): void {

  container.innerHTML = `

    <h3>Your roster</h3>

    <ul class="roster-list">

      ${roster.map((p) => `<li class="${posCssClass(p.pos)}"><span class="pos-badge ${posCssClass(p.pos)}">${p.pos}</span> ${escapeHtml(p.name)} <span class="muted">${p.team}${p.adp != null ? ` · ADP ${p.adp.toFixed(1)}` : ''}</span></li>`).join('')}

    </ul>`;

}


