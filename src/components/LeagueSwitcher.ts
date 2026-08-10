import { escapeHtml } from '../utils/escapeHtml';
import {
  addLeague,
  getActiveLeague,
  listLeagues,
  removeLeague,
  renameLeague,
  setActiveLeague,
} from '../state/leaguesStore';

export function mountLeagueSwitcher(container: HTMLElement, onLeagueChange: () => void): () => void {
  let manageOpen = false;
  let renameId: string | null = null;

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
                           <button type="button" class="btn secondary btn-xs league-rename-btn" data-id="${escapeHtml(league.id)}">Rename</button>
                           ${leagues.length > 1 ? `<button type="button" class="btn secondary btn-xs league-delete-btn" data-id="${escapeHtml(league.id)}">Delete</button>` : ''}
                         </div>`
                  }
                </li>`;
              })
              .join('')}
          </ul>
          <footer class="league-modal-footer">
            <button type="button" id="add-league" class="btn primary">Add league</button>
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
