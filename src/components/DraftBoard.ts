import type { DraftPick, DraftConfig } from '../data/types';
import { getTeamDisplayName } from './TeamNamesEditor';

export function renderDraftBoard(
  container: HTMLElement,
  picks: DraftPick[],
  config: DraftConfig,
  userSlot: number,
  teamNames?: string[],
): void {
  const { teams, rounds } = config;
  const names = teamNames ?? Array.from({ length: teams }, (_, i) => getTeamDisplayName(i));

  let html = '<div class="draft-board"><table><thead><tr><th>Round</th>';
  for (let t = 1; t <= teams; t++) {
    const label = t === userSlot ? `You (${names[t - 1]})` : names[t - 1];
    html += `<th class="${t === userSlot ? 'user-col' : ''}">${escapeHtml(label)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let r = 1; r <= rounds; r++) {
    html += `<tr><td class="round-num">R${r}</td>`;
    for (let t = 1; t <= teams; t++) {
      const pick = picks.find((p) => p.round === r && p.teamIndex === t - 1);
      const cls = t === userSlot ? 'user-col' : '';
      html += `<td class="${cls}">${pick ? `<span class="pick-pos">${pick.pos}</span> ${escapeHtml(pick.playerName)}` : '—'}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderRosterSummary(container: HTMLElement, roster: { name: string; pos: string; team: string; adp: number | null }[]): void {
  container.innerHTML = `
    <h3>Your roster</h3>
    <ul class="roster-list">
      ${roster.map((p) => `<li><span class="pos">${p.pos}</span> ${escapeHtml(p.name)} <span class="muted">${p.team}${p.adp != null ? ` · ADP ${p.adp.toFixed(1)}` : ''}</span></li>`).join('')}
    </ul>`;
}
