import type { Player, ScoringFormat } from '../data/types';
import { analyzeTrade } from '../utils/tradeAnalyzer';
import { escapeHtml } from '../utils/escapeHtml';

export function mountTradeAnalyzerPanel(
  container: HTMLElement,
  myRoster: Player[],
  freeAgents: Player[],
  scoring: ScoringFormat,
): void {
  container.innerHTML = `
    <section class="panel trade-analyzer">
      <h3>Trade analyzer</h3>
      <p class="hint">Compare projected rest-of-season value for a hypothetical trade.</p>
      <div class="trade-analyzer-grid">
        <div>
          <label>You give
            <select id="trade-give" multiple size="6" class="trade-select">
              ${myRoster.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(String(p.pos))})</option>`).join('')}
            </select>
          </label>
        </div>
        <div>
          <label>You receive
            <select id="trade-receive" multiple size="6" class="trade-select">
              ${freeAgents
                .slice(0, 80)
                .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(String(p.pos))})</option>`)
                .join('')}
            </select>
          </label>
        </div>
      </div>
      <button type="button" id="trade-analyze" class="btn secondary btn-xs">Analyze trade</button>
      <div id="trade-result" class="trade-result"></div>
    </section>`;

  const byId = (ids: string[]): Player[] =>
    ids.map((id) => myRoster.find((p) => p.id === id) ?? freeAgents.find((p) => p.id === id)).filter(Boolean) as Player[];

  container.querySelector('#trade-analyze')!.addEventListener('click', () => {
    const giveSel = container.querySelector('#trade-give') as HTMLSelectElement;
    const recvSel = container.querySelector('#trade-receive') as HTMLSelectElement;
    const giveIds = [...giveSel.selectedOptions].map((o) => o.value);
    const recvIds = [...recvSel.selectedOptions].map((o) => o.value);
    const resultEl = container.querySelector('#trade-result') as HTMLElement;

    if (!giveIds.length && !recvIds.length) {
      resultEl.innerHTML = '<p class="error">Select at least one player to give or receive.</p>';
      return;
    }

    const analysis = analyzeTrade(byId(giveIds), byId(recvIds), scoring);
    const gradeCls = analysis.grade === 'win' ? 'delta-pos' : analysis.grade === 'loss' ? 'delta-neg' : 'muted';
    resultEl.innerHTML = `
      <p class="${gradeCls}"><strong>${escapeHtml(analysis.verdict)}</strong></p>
      <p class="muted">Give: ${analysis.giveTotal.toFixed(1)} · Receive: ${analysis.receiveTotal.toFixed(1)} · Net: ${analysis.delta >= 0 ? '+' : ''}${analysis.delta.toFixed(1)}</p>`;
  });
}
