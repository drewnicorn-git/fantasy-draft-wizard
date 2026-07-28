export interface ManualToolbarState {
  dirty: boolean;
  savedAt: string | null;
}

export function renderManualToolbar(
  container: HTMLElement,
  toolbarState: ManualToolbarState,
  handlers: {
    onSave: () => void;
    onReset: () => void;
  },
): void {
  const savedLabel = toolbarState.savedAt
    ? `Saved ${new Date(toolbarState.savedAt).toLocaleString()}`
    : 'Not saved yet';

  container.innerHTML = `
    <div class="sheet-toolbar manual-toolbar">
      <button type="button" id="save-manual-sort" class="btn primary">Save manual sort</button>
      <button type="button" id="reset-manual-sort" class="btn secondary">Reset to consensus</button>
      <span class="sheet-status ${toolbarState.dirty ? 'manual-dirty' : 'locked'}">
        ${toolbarState.dirty ? 'Unsaved manual changes — drag rows to reorder' : savedLabel}
      </span>
    </div>`;

  container.querySelector('#save-manual-sort')!.addEventListener('click', handlers.onSave);
  container.querySelector('#reset-manual-sort')!.addEventListener('click', () => {
    if (
      !toolbarState.dirty ||
      confirm('Reset manual order to consensus rankings? Unsaved changes will be lost.')
    ) {
      handlers.onReset();
    }
  });
}
