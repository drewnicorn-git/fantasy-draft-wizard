import { reloadRankings, getSheetLocked, lockSheet, unlockSheet } from '../state/appState';

const isProd = import.meta.env.PROD;
const refreshLabel = isProd ? 'Reload snapshot' : 'Refresh from live APIs';
const refreshTitle = isProd
  ? 'Reload rankings.json from this site (updated daily by GitHub Actions)'
  : 'Dev only: fetch live ESPN, Sleeper, and Fantasy Calc data in the browser';

export function renderSheetToolbar(container: HTMLElement, onChange: () => void): void {
  const locked = getSheetLocked();

  container.innerHTML = `
    <div class="sheet-toolbar">
      <button type="button" id="refresh-rankings" class="btn secondary" title="${refreshTitle}">${refreshLabel}</button>
      <span id="refresh-status" class="sheet-status muted"></span>
      ${
        locked
          ? `<button type="button" id="unlock-sheet" class="btn secondary">Unlock sheet</button>
             <span class="sheet-status locked">Sheet locked — tags cannot be edited</span>`
          : `<button type="button" id="save-sheet" class="btn primary">Lock sheet</button>
             <span class="sheet-status">Sheet unlocked — tag edits allowed</span>`
      }
    </div>`;

  container.querySelector('#refresh-rankings')!.addEventListener('click', async () => {
    const btn = container.querySelector('#refresh-rankings') as HTMLButtonElement;
    const status = container.querySelector('#refresh-status') as HTMLElement;
    btn.disabled = true;
    status.textContent = 'Starting refresh…';
    try {
      await reloadRankings((msg) => {
        status.textContent = msg;
      });
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      btn.disabled = false;
      status.textContent = '';
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
