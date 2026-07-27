import type { DraftPick, DraftConfig } from '../data/types';

export function renderDraftBoard(container: HTMLElement, picks: DraftPick[], config: DraftConfig, userSlot: number): void {
  const { teams, rounds } = config;
  let html = '<div class="draft-board"><table><thead><tr><th>Round</th>';
  for (let t = 1; t <= teams; t++) {
    html += `<th class="${t === userSlot ? 'user-col' : ''}">${t === userSlot ? 'You' : `T${t}`}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let r = 1; r <= rounds; r++) {
    html += `<tr><td class="round-num">R${r}</td>`;
    for (let t = 1; t <= teams; t++) {
      const pick = picks.find((p) => p.round === r && p.pickInRound === t);
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
