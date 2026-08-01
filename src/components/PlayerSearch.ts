import { state } from '../state/appState';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderPlayerSearch(container: HTMLElement, onChange: () => void): void {
  const q = state.filters.search.trim();
  container.innerHTML = `
    <div class="player-search-bar">
      <label class="player-search-label" for="player-quick-search">Search</label>
      <input
        type="search"
        id="player-quick-search"
        class="player-search-input"
        placeholder="Find player by name…"
        value="${escapeHtml(state.filters.search)}"
        autocomplete="off"
        spellcheck="false"
      />
      ${q ? `<button type="button" id="clear-player-search" class="btn sm secondary">Clear</button>` : ''}
    </div>`;

  const input = container.querySelector('#player-quick-search') as HTMLInputElement;
  input.addEventListener('input', () => {
    state.filters.search = input.value;
    onChange();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      state.filters.search = '';
      input.value = '';
      onChange();
    }
  });

  container.querySelector('#clear-player-search')?.addEventListener('click', () => {
    state.filters.search = '';
    onChange();
  });
}
