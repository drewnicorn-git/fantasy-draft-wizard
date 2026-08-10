import { loadTeamNames, saveTeamNames } from '../utils/storage';
import { state } from '../state/appState';
import { escapeHtml } from '../utils/escapeHtml';

export function renderTeamNamesEditor(container: HTMLElement, onChange: () => void): void {
  const teams = state.draftConfig.teams;
  const names = loadTeamNames(teams);

  container.innerHTML = `
    <details class="team-names-editor" open>
      <summary>Team names</summary>
      <p class="hint">Name each team in your league. Your slot is highlighted.</p>
      <div class="team-names-grid">
        ${names
          .map(
            (name, i) => `
          <label class="${i + 1 === state.draftConfig.slot ? 'your-team' : ''}">
            <span>Slot ${i + 1}${i + 1 === state.draftConfig.slot ? ' (you)' : ''}</span>
            <input type="text" data-team-idx="${i}" value="${escapeHtml(name)}" maxlength="32" />
          </label>`,
          )
          .join('')}
      </div>
    </details>`;

  container.querySelectorAll<HTMLInputElement>('[data-team-idx]').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.teamIdx);
      const next = loadTeamNames(teams);
      next[idx] = input.value.trim() || `Team ${idx + 1}`;
      saveTeamNames(next);
      onChange();
    });
  });
}

export function getTeamDisplayName(teamIndex: number): string {
  const names = loadTeamNames(state.draftConfig.teams);
  return names[teamIndex] ?? `Team ${teamIndex + 1}`;
}
