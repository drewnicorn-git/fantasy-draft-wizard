import { getInjuries, getInSeason, getRankings, state } from '../state/appState';
import {
  clearComparePlayers,
  getComparePlayerIds,
  removeComparePlayer,
  subscribeComparePlayers,
} from '../state/playerCompare';
import { buildPlayerCompareMetrics, resolveComparePlayers } from '../utils/playerCompareData';
import { escapeHtml } from '../utils/escapeHtml';
import { syncCompareInHash } from '../utils/appRouting';

export function mountPlayerComparePanel(container: HTMLElement, onLayoutChange?: () => void): () => void {
  const render = (): void => {
    const ids = getComparePlayerIds();
    syncCompareInHash(state.tab, ids);

    if (!ids.length) {
      container.innerHTML = '';
      container.classList.add('hidden');
      container.classList.remove('player-compare-open');
      onLayoutChange?.();
      return;
    }

    const rankings = getRankings();
    const players = resolveComparePlayers(rankings?.players ?? [], ids);
    if (!players.length) {
      container.innerHTML = '';
      container.classList.add('hidden');
      onLayoutChange?.();
      return;
    }

    container.classList.remove('hidden');
    container.classList.add('player-compare-open');

    const metrics = buildPlayerCompareMetrics(players, {
      scoring: state.scoring,
      inSeason: getInSeason(),
      injuries: getInjuries(),
    });

    const headerCells = players
      .map(
        (p) =>
          `<th><span class="pos-badge">${escapeHtml(String(p.pos))}</span> ${escapeHtml(p.name)}
            <button type="button" class="btn secondary btn-xs compare-remove" data-remove-compare="${escapeHtml(p.id)}" aria-label="Remove ${escapeHtml(p.name)} from compare">×</button></th>`,
      )
      .join('');

    const body = metrics
      .map(
        (row) =>
          `<tr><th scope="row">${escapeHtml(row.label)}</th>${row.values.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`,
      )
      .join('');

    const shareUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;

    container.innerHTML = `
      <div class="player-compare-panel" role="region" aria-label="Player comparison">
        <div class="player-compare-header">
          <strong>Compare players</strong>
          <span class="hint">${players.length}/3 selected</span>
          <div class="player-compare-actions">
            <button type="button" class="btn secondary btn-xs" id="compare-copy-link">Copy link</button>
            <button type="button" class="btn secondary btn-xs" id="compare-clear">Clear</button>
            <button type="button" class="btn secondary btn-xs" id="compare-collapse" aria-expanded="true">Hide</button>
          </div>
        </div>
        <div class="player-compare-body">
          <div class="table-wrap">
            <table class="player-compare-table">
              <thead><tr><th>Metric</th>${headerCells}</tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
          <p class="hint">★ = best among compared players for that metric.</p>
        </div>
      </div>`;

    container.querySelector('#compare-clear')?.addEventListener('click', () => clearComparePlayers());

    container.querySelector('#compare-collapse')?.addEventListener('click', () => {
      container.classList.toggle('player-compare-collapsed');
      const collapsed = container.classList.contains('player-compare-collapsed');
      const btn = container.querySelector('#compare-collapse') as HTMLButtonElement;
      if (btn) {
        btn.textContent = collapsed ? 'Show' : 'Hide';
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
    });

    container.querySelector('#compare-copy-link')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        const btn = container.querySelector('#compare-copy-link') as HTMLButtonElement;
        if (btn) {
          const prev = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = prev;
          }, 1500);
        }
      } catch {
        prompt('Copy this compare link:', shareUrl);
      }
    });

    container.querySelectorAll('[data-remove-compare]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeComparePlayer((btn as HTMLElement).dataset.removeCompare!);
      });
    });

    onLayoutChange?.();
  };

  const unsub = subscribeComparePlayers(render);
  render();
  return unsub;
}
