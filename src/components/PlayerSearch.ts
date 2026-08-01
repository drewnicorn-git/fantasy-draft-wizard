import { state } from '../state/appState';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function syncClearButton(container: HTMLElement, visible: boolean): void {
  const clearBtn = container.querySelector('#clear-player-search') as HTMLElement | null;
  if (clearBtn) clearBtn.classList.toggle('hidden', !visible);
}

export function mountPlayerSearch(container: HTMLElement, onChange: () => void): void {
  if (container.dataset.searchMounted === '1') return;

  container.dataset.searchMounted = '1';
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
      <button type="button" id="clear-player-search" class="btn sm secondary hidden">Clear</button>
    </div>`;

  const input = container.querySelector('#player-quick-search') as HTMLInputElement;
  syncClearButton(container, !!state.filters.search.trim());

  input.addEventListener('input', () => {
    state.filters.search = input.value;
    syncClearButton(container, !!input.value.trim());
    onChange();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      state.filters.search = '';
      input.value = '';
      syncClearButton(container, false);
      onChange();
    }
  });

  container.querySelector('#clear-player-search')?.addEventListener('click', () => {
    state.filters.search = '';
    input.value = '';
    syncClearButton(container, false);
    onChange();
  });
}