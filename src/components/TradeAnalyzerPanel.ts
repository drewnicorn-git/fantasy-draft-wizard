import type { Player, ScoringFormat } from '../data/types';
import { analyzeTrade } from '../utils/tradeAnalyzer';
import { escapeHtml } from '../utils/escapeHtml';

const WAIVERS_PARTNER = 'waivers';

export interface TradeAnalyzerOptions {
  myTeamIndex: number;
  teamCount: number;
  getTeamRoster: (teamIndex: number) => Player[];
  getTeamLabel: (teamIndex: number) => string;
  waivers: Player[];
  scoring: ScoringFormat;
}

function renderPlayerOptions(players: Player[]): string {
  return players
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(String(p.pos))})</option>`)
    .join('');
}

function buildPlayerLookup(
  myRoster: Player[],
  getTeamRoster: (teamIndex: number) => Player[],
  teamCount: number,
  waivers: Player[],
): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const p of myRoster) map.set(p.id, p);
  for (let i = 0; i < teamCount; i++) {
    for (const p of getTeamRoster(i)) map.set(p.id, p);
  }
  for (const p of waivers) map.set(p.id, p);
  return map;
}

export function mountTradeAnalyzerPanel(container: HTMLElement, opts: TradeAnalyzerOptions): void {
  const myRoster = opts.getTeamRoster(opts.myTeamIndex);
  const playerLookup = buildPlayerLookup(
    myRoster,
    opts.getTeamRoster,
    opts.teamCount,
    opts.waivers,
  );

  const partnerOptions = [
    ...Array.from({ length: opts.teamCount }, (_, i) => i)
      .filter((i) => i !== opts.myTeamIndex)
      .map(
        (i) =>
          `<option value="${i}">${escapeHtml(opts.getTeamLabel(i))}</option>`,
      ),
    `<option value="${WAIVERS_PARTNER}">Waivers</option>`,
  ].join('');

  const defaultPartner =
    Array.from({ length: opts.teamCount }, (_, i) => i).find((i) => i !== opts.myTeamIndex) ??
    WAIVERS_PARTNER;

  const receivePlayers =
    defaultPartner === WAIVERS_PARTNER
      ? opts.waivers
      : opts.getTeamRoster(Number(defaultPartner));

  container.innerHTML = `
    <section class="panel trade-analyzer">
      <h3>Trade analyzer</h3>
      <p class="hint">Compare projected rest-of-season value for a hypothetical trade with any team or waivers.</p>
      <div class="trade-analyzer-grid">
        <div>
          <label>You give <span class="muted">(${escapeHtml(opts.getTeamLabel(opts.myTeamIndex))})</span>
            <select id="trade-give" multiple size="8" class="trade-select">
              ${renderPlayerOptions(myRoster)}
            </select>
          </label>
        </div>
        <div>
          <label for="trade-partner">Trade partner
            <select id="trade-partner" class="trade-partner-select">
              ${partnerOptions}
            </select>
          </label>
          <label>You receive
            <select id="trade-receive" multiple size="8" class="trade-select">
              ${renderPlayerOptions(receivePlayers)}
            </select>
          </label>
        </div>
      </div>
      <button type="button" id="trade-analyze" class="btn secondary btn-xs">Analyze trade</button>
      <div id="trade-result" class="trade-result"></div>
    </section>`;

  const partnerSel = container.querySelector('#trade-partner') as HTMLSelectElement;
  const recvSel = container.querySelector('#trade-receive') as HTMLSelectElement;

  partnerSel.value = String(defaultPartner);

  partnerSel.addEventListener('change', () => {
    const partner = partnerSel.value;
    const roster =
      partner === WAIVERS_PARTNER ? opts.waivers : opts.getTeamRoster(Number(partner));
    recvSel.innerHTML = renderPlayerOptions(roster);
  });

  container.querySelector('#trade-analyze')!.addEventListener('click', () => {
    const giveSel = container.querySelector('#trade-give') as HTMLSelectElement;
    const giveIds = [...giveSel.selectedOptions].map((o) => o.value);
    const recvIds = [...recvSel.selectedOptions].map((o) => o.value);
    const resultEl = container.querySelector('#trade-result') as HTMLElement;

    if (!giveIds.length && !recvIds.length) {
      resultEl.innerHTML = '<p class="error">Select at least one player to give or receive.</p>';
      return;
    }

    const byId = (ids: string[]): Player[] =>
      ids.map((id) => playerLookup.get(id)).filter((p): p is Player => !!p);

    const analysis = analyzeTrade(byId(giveIds), byId(recvIds), opts.scoring);
    const gradeCls = analysis.grade === 'win' ? 'delta-pos' : analysis.grade === 'loss' ? 'delta-neg' : 'muted';
    const partnerLabel =
      partnerSel.value === WAIVERS_PARTNER
        ? 'Waivers'
        : opts.getTeamLabel(Number(partnerSel.value));
    resultEl.innerHTML = `
      <p class="${gradeCls}"><strong>${escapeHtml(analysis.verdict)}</strong></p>
      <p class="muted">With ${escapeHtml(partnerLabel)} · Give: ${analysis.giveTotal.toFixed(1)} · Receive: ${analysis.receiveTotal.toFixed(1)} · Net: ${analysis.delta >= 0 ? '+' : ''}${analysis.delta.toFixed(1)}</p>`;
  });
}
