import type { SourceKey } from '../data/types';
import { getRankings, state, toggleSource } from '../state/appState';
import { SOURCE_LABELS } from '../utils/scoring';

export function renderSourceSelector(container: HTMLElement, onChange: () => void): void {
  const data = getRankings();
  const available = data?.sources ?? [];

  container.innerHTML = `
    <div class="source-selector">
      <span class="label">Ranking sources</span>
      <p class="hint">Check sources to include in the consensus column. Uncheck to exclude a list from the average.</p>
      <div class="source-checkboxes">
        ${available
          .map(
            (s) => `
          <label class="source-check">
            <input type="checkbox" data-source="${s}" ${state.selectedSources.has(s) ? 'checked' : ''} />
            <span>${SOURCE_LABELS[s] ?? s}</span>
          </label>`,
          )
          .join('')}
      </div>
    </div>`;

  container.querySelectorAll<HTMLInputElement>('[data-source]').forEach((input) => {
    input.addEventListener('change', () => {
      toggleSource(input.dataset.source as SourceKey);
      onChange();
      renderSourceSelector(container, onChange);
    });
  });
}
