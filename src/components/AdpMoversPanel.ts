import { getRankings, state } from '../state/appState';
import { computeAdpMovers, saveAdpSnapshot, loadAdpSnapshot } from '../utils/adpMovers';
import { escapeHtml } from '../utils/escapeHtml';

export function renderAdpMoversPanel(container: HTMLElement): void {
  const data = getRankings();
  if (!data) {
    container.innerHTML = '';
    return;
  }

  const snapshot = loadAdpSnapshot();
  if (!snapshot) {
    saveAdpSnapshot(data.players, data.builtAt, state.scoring);
    container.innerHTML = `<p class="hint adp-movers-hint">ADP movers will appear after the next rankings refresh.</p>`;
    return;
  }

  if (snapshot.builtAt !== data.builtAt) {
    const { risers, fallers, snapshotDate } = computeAdpMovers(data.players, state.scoring, 8);
    const dateLabel = snapshotDate ? new Date(snapshotDate).toLocaleDateString() : 'last snapshot';

    container.innerHTML = `
      <section class="adp-movers-panel">
        <h3>Draft stock (since ${escapeHtml(dateLabel)})</h3>
        <div class="adp-movers-grid">
          <div>
            <h4>Risers</h4>
            ${
              risers.length
                ? `<ul class="adp-movers-list">${risers
                    .map(
                      (m) =>
                        `<li><strong>${escapeHtml(m.player.name)}</strong> <span class="muted">${escapeHtml(String(m.player.pos))}</span> ${m.previous.toFixed(0)} → ${m.current.toFixed(0)} <span class="delta-pos">+${m.delta.toFixed(0)}</span></li>`,
                    )
                    .join('')}</ul>`
                : '<p class="muted">No risers</p>'
            }
          </div>
          <div>
            <h4 Fallers</h4>
            ${
              fallers.length
                ? `<ul class="adp-movers-list">${fallers
                    .map(
                      (m) =>
                        `<li><strong>${escapeHtml(m.player.name)}</strong> <span class="muted">${escapeHtml(String(m.player.pos))}</span> ${m.previous.toFixed(0)} → ${m.current.toFixed(0)} <span class="delta-neg">${m.delta.toFixed(0)}</span></li>`,
                    )
                    .join('')}</ul>`
                : '<p class="muted">No fallers</p>'
            }
          </div>
        </div>
      </section>`;

    saveAdpSnapshot(data.players, data.builtAt, state.scoring);
    return;
  }

  container.innerHTML = `<p class="hint adp-movers-hint">ADP snapshot current — movers update when rankings refresh.</p>`;
}
