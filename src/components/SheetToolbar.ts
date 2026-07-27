import { reloadRankings, getSheetLocked, lockSheet, unlockSheet } from '../state/appState';

export function renderSheetToolbar(container: HTMLElement, onChange: () => void): void {
  const locked = getSheetLocked();

  container.innerHTML = `
    <div class="sheet-toolbar">
      <button type="button" id="refresh-rankings" class="btn secondary">Refresh rankings</button>
      ${
        locked
          ? `<button type="button" id="unlock-sheet" class="btn secondary">Edit sheet</button>
             <span class="sheet-status locked">Sheet locked — edits saved</span>`
          : `<button type="button" id="save-sheet" class="btn primary">Save changes</button>
             <span class="sheet-status">Unsaved edits — tags and tiers can be changed</span>`
      }
    </div>`;

  container.querySelector('#refresh-rankings')!.addEventListener('click', async () => {
    const btn = container.querySelector('#refresh-rankings') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
    try {
      await reloadRankings();
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Refresh rankings';
      renderSheetToolbar(container, onChange);
    }
  });

  container.querySelector('#save-sheet')?.addEventListener('click', () => {
    lockSheet();
    renderSheetToolbar(container, onChange);
    onChange();
  });

  container.querySelector('#unlock-sheet')?.addEventListener('click', () => {
    unlockSheet();
    renderSheetToolbar(container, onChange);
    onChange();
  });
}
