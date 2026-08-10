import { escapeHtml } from '../utils/escapeHtml';
import {
  addLeague,
  getActiveLeague,
  importLeague,
  listLeagues,
  loadLeaguesStore,
  removeLeague,
  renameLeague,
  replaceLeaguesStore,
  setActiveLeague,
} from '../state/leaguesStore';
import {
  buildLeagueExportFile,
  buildLeaguesStoreExportFile,
  downloadJson,
  parseLeagueImportPayload,
  parseLeaguesStoreImportPayload,
  sanitizeImportedStore,
} from '../utils/leagueExport';

function safeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'league';
}

export function mountLeagueSwitcher(container: HTMLElement, onLeagueChange: () => void): () => void {
  let manageOpen = false;
  let renameId: string | null = null;
  let importInput: HTMLInputElement | null = null;

  const ensureImportInput = (): HTMLInputElement => {
    if (importInput) return importInput;
    importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.hidden = true;
    importInput.addEventListener('change', () => {
      const file = importInput?.files?.[0];
      if (!file) return;
      void handleImportFile(file);
      if (importInput) importInput.value = '';
    });
    document.body.appendChild(importInput);
    return importInput;
  };

  const handleImportFile = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      if (
        typeof parsed === 'object' &&
        parsed != null &&
        ('format' in parsed
          ? (parsed as { format?: string }).format === 'fdw-leagues-store'
          : 'leagues' in parsed && 'activeLeagueId' in parsed)
      ) {
        if (!confirm('Replace all leagues with this backup? Current leagues will be overwritten.')) return;
        const store = sanitizeImportedStore(parseLeaguesStoreImportPayload(parsed));
        replaceLeaguesStore(store);
        closeManage();
        onLeagueChange();
        return;
      }

      const profile = parseLeagueImportPayload(parsed);
      const defaultName = profile.name.trim() || 'Imported league';
      const name = prompt('Import league as:', defaultName);
      if (name == null) return;
      importLeague(profile, { name, activate: true });
      closeManage();
      onLeagueChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not import league file');
    }
  };

  const closeManage = (): void => {
    manageOpen = false;
    renameId = null;
    draw();
  };

  const switchLeague = (id: string): void => {
    if (id === getActiveLeague().id) return;
    setActiveLeague(id);
    closeManage();
    onLeagueChange();
  };

  const draw = (): void => {
    const active = getActiveLeague();
    const leagues = listLeagues();

    container.innerHTML = `
      <div class="league-switcher">
        <label class="league-switcher-label">
          <span class="sr-only">Active league</span>
          <select id="league-select" class="league-select" aria-label="Active league">
            ${leagues
              .map(
                (league) =>
                  `<option value="${escapeHtml(league.id)}"${league.id === active.id ? ' selected' : ''}>${escapeHtml(league.name)}</option>`,
              )
              .join('')}
          </select>
        </label>
        <button type="button" id="manage-leagues" class="btn secondary btn-xs">Manage</button>
      </div>
      ${
        manageOpen
          ? `<div class="league-modal-backdrop" id="league-modal-backdrop">
        <div class="league-modal" role="dialog" aria-labelledby="league-modal-title" aria-modal="true">
          <header class="league-modal-header">
            <h2 id="league-modal-title">Manage leagues</h2>
            <button type="button" id="close-league-modal" class="btn secondary btn-xs" aria-label="Close">×</button>
          </header>
          <ul class="league-modal-list">
            ${leagues
              .map((league) => {
                const isActive = league.id === active.id;
                const isRenaming = renameId === league.id;
                return `<li class="league-modal-item${isActive ? ' active' : ''}">
                  ${
                    isRenaming
                      ? `<form class="league-rename-form" data-id="${escapeHtml(league.id)}">
                          <input type="text" class="league-rename-input" value="${escapeHtml(league.name)}" maxlength="48" required />
                          <button type="submit" class="btn primary btn-xs">Save</button>
                          <button type="button" class="btn secondary btn-xs league-rename-cancel">Cancel</button>
                        </form>`
                      : `<span class="league-modal-name">${escapeHtml(league.name)}${isActive ? ' <span class="league-active-badge">Active</span>' : ''}</span>
                         <div class="league-modal-actions">
                           ${isActive ? '' : `<button type="button" class="btn secondary btn-xs league-switch-btn" data-id="${escapeHtml(league.id)}">Switch</button>`}
                           <button type="button" class="btn secondary btn-xs league-export-btn" data-id="${escapeHtml(league.id)}">Export</button>
                           <button type="button" class="btn secondary btn-xs league-rename-btn" data-id="${escapeHtml(league.id)}">Rename</button>
                           ${leagues.length > 1 ? `<button type="button" class="btn secondary btn-xs league-delete-btn" data-id="${escapeHtml(league.id)}">Delete</button>` : ''}
                         </div>`
                  }
                </li>`;
              })
              .join('')}
          </ul>
          <footer class="league-modal-footer league-modal-footer-actions">
            <button type="button" id="add-league" class="btn primary">Add league</button>
            <button type="button" id="export-active-league" class="btn secondary">Export active</button>
            <button type="button" id="export-all-leagues" class="btn secondary">Backup all</button>
            <button type="button" id="import-league" class="btn secondary">Import…</button>
          </footer>
        </div>
      </div>`
          : ''
      }`;

    container.querySelector('#league-select')?.addEventListener('change', (e) => {
      switchLeague((e.target as HTMLSelectElement).value);
    });

    container.querySelector('#manage-leagues')?.addEventListener('click', () => {
      manageOpen = true;
      draw();
    });

    container.querySelector('#close-league-modal')?.addEventListener('click', closeManage);
    container.querySelector('#league-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeManage();
    });

    container.querySelector('#add-league')?.addEventListener('click', () => {
      const name = prompt('New league name:', 'New league');
      if (name == null) return;
      const league = addLeague(name);
      switchLeague(league.id);
    });

    container.querySelector('#export-active-league')?.addEventListener('click', () => {
      const league = getActiveLeague();
      downloadJson(`${safeFilename(league.name)}-league.json`, buildLeagueExportFile(league));
    });

    container.querySelector('#export-all-leagues')?.addEventListener('click', () => {
      downloadJson('fantasy-draft-wizard-leagues.json', buildLeaguesStoreExportFile(loadLeaguesStore()));
    });

    container.querySelector('#import-league')?.addEventListener('click', () => {
      ensureImportInput().click();
    });

    container.querySelectorAll('.league-export-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const league = listLeagues().find((l) => l.id === id);
        if (!league) return;
        downloadJson(`${safeFilename(league.name)}-league.json`, buildLeagueExportFile(league));
      });
    });

    container.querySelectorAll('.league-switch-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchLeague((btn as HTMLElement).dataset.id!);
      });
    });

    container.querySelectorAll('.league-rename-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        renameId = (btn as HTMLElement).dataset.id ?? null;
        draw();
        (container.querySelector('.league-rename-input') as HTMLInputElement | null)?.focus();
      });
    });

    container.querySelectorAll('.league-rename-cancel').forEach((btn) => {
      btn.addEventListener('click', () => {
        renameId = null;
        draw();
      });
    });

    container.querySelectorAll('.league-rename-form').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = (form as HTMLElement).dataset.id!;
        const input = form.querySelector('.league-rename-input') as HTMLInputElement;
        try {
          renameLeague(id, input.value);
          renameId = null;
          draw();
          if (id === getActiveLeague().id) onLeagueChange();
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Could not rename league');
        }
      });
    });

    container.querySelectorAll('.league-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const league = listLeagues().find((l) => l.id === id);
        if (!league) return;
        if (!confirm(`Delete "${league.name}"? This league's tags, keepers, and draft data will be removed.`)) return;
        try {
          removeLeague(id);
          renameId = null;
          closeManage();
          onLeagueChange();
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Could not delete league');
        }
      });
    });
  };

  draw();
  return draw;
}
