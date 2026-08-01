import type { DraftConfig, DraftPick, Player, ScoringFormat } from '../data/types';
import { countRoster, rosterNeedScore, ROSTER_LIMITS } from '../sim/bot';
import { getConsensus } from './scoring';
import { byeWeekConflicts, detectPositionalRun } from './analytics';
import { roundFromOverall } from '../sim/snake';

export interface DraftAdvice {
  alerts: string[];
  recommendation: string;
  suggestedPicks: Player[];
}

const RUN_POSITIONS = ['RB', 'WR', 'TE', 'QB'] as const;

function getAdpOrConsensus(p: Player, scoring: ScoringFormat): number | null {
  return p.adp[scoring] ?? getConsensus(p, scoring);
}

function scorePlayerForUser(
  p: Player,
  overallPick: number,
  round: number,
  counts: ReturnType<typeof countRoster>,
  config: DraftConfig,
): number {
  const scoring = config.scoring;
  const adp = getAdpOrConsensus(p, scoring) ?? 999;
  const adpScore = Math.exp(-adp / 75);
  const need = rosterNeedScore(p.pos, counts, round, 'balanced');
  const diff = adp - overallPick;
  let reach = 1;
  if (diff > 18) reach = 0.5;
  else if (diff > 12) reach = 0.72;
  else if (diff < -18) reach = 1.12;
  else if (diff < -8) reach = 1.06;
  return adpScore * need * reach;
}

export function buildDraftAlerts(recentPicks: { pos: string }[], userRoster: Player[]): string[] {
  const alerts: string[] = [];
  const recent = recentPicks.slice(-4);
  for (const pos of RUN_POSITIONS) {
    if (detectPositionalRun(recent, pos)) alerts.push(`${pos} run — ${pos}s going fast`);
  }
  const byes = byeWeekConflicts(userRoster);
  if (byes.length) alerts.push(`Bye conflict weeks: ${byes.join(', ')}`);
  return alerts;
}

function recommendPosition(
  roster: Player[],
  available: Player[],
  overall: number,
  config: DraftConfig,
): string {
  const counts = countRoster(roster);
  const { round } = roundFromOverall(overall, config.teams);
  const scoring = config.scoring;
  const positions = ['RB', 'WR', 'TE', 'QB', 'K', 'DST'] as const;

  const ranked = positions
    .map((pos) => {
      const need = rosterNeedScore(pos, counts, round, 'balanced');
      const atPos = available.filter((p) => p.pos === pos);
      const best = [...atPos].sort(
        (a, b) => (getAdpOrConsensus(a, scoring) ?? 9999) - (getAdpOrConsensus(b, scoring) ?? 9999),
      )[0];
      return { pos, need, count: atPos.length, bestRank: best ? getAdpOrConsensus(best, scoring) : null };
    })
    .filter((x) => x.need > 0.08 && x.count > 0)
    .sort((a, b) => b.need - a.need);

  if (!ranked.length) {
    return 'Roster looks full at core spots — take best player available.';
  }

  const top = ranked[0];
  const startersNeeded: string[] = [];
  if (counts.RB < ROSTER_LIMITS.RB) startersNeeded.push('RB');
  if (counts.WR < ROSTER_LIMITS.WR) startersNeeded.push('WR');
  if (counts.TE < ROSTER_LIMITS.TE) startersNeeded.push('TE');
  if (counts.QB < ROSTER_LIMITS.QB) startersNeeded.push('QB');

  if (startersNeeded.includes(top.pos)) {
    return `Priority: ${top.pos} — you still need a starter there (${counts[top.pos as keyof typeof counts]}/${ROSTER_LIMITS[top.pos as keyof typeof ROSTER_LIMITS]}).`;
  }

  if (top.pos === 'RB' || top.pos === 'WR') {
    return `Priority: ${top.pos} — add depth at ${top.pos} (${counts[top.pos]}/${ROSTER_LIMITS[top.pos]} + flex).`;
  }

  if (top.pos === 'K' || top.pos === 'DST') {
    return `Priority: ${top.pos} — fill your ${top.pos} slot before the board thins out.`;
  }

  return `Priority: ${top.pos} — best roster fit with ${top.count} ${top.pos}s still available.`;
}

export function userSuggestedPicks(
  available: Player[],
  roster: Player[],
  overallPick: number,
  config: DraftConfig,
  limit = 3,
): Player[] {
  const { round } = roundFromOverall(overallPick, config.teams);
  const counts = countRoster(roster);
  return [...available]
    .filter((p) => ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(p.pos))
    .map((p) => ({ p, score: scorePlayerForUser(p, overallPick, round, counts, config) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

export function getDraftAdvice(
  allPicks: DraftPick[],
  userRoster: Player[],
  available: Player[],
  overall: number,
  config: DraftConfig,
): DraftAdvice {
  return {
    alerts: buildDraftAlerts(allPicks, userRoster),
    recommendation: recommendPosition(userRoster, available, overall, config),
    suggestedPicks: userSuggestedPicks(available, userRoster, overall, config),
  };
}

export function escapeDraftHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderDraftAdvicePanel(
  container: HTMLElement,
  advice: DraftAdvice,
  opts: { onPick?: (playerId: string) => void; showSuggestions?: boolean } = {},
): void {
  const showSuggestions = opts.showSuggestions ?? !!opts.onPick;
  const alertsHtml = advice.alerts.map((a) => `<div class="alert">${escapeDraftHtml(a)}</div>`).join('');
  const suggestionHtml =
    showSuggestions && advice.suggestedPicks.length
      ? `<div class="draft-suggestions">
          <h4>Suggested picks</h4>
          <div class="suggestion-chips">
            ${advice.suggestedPicks
              .map(
                (p) =>
                  `<button type="button" class="chip pick-btn" data-id="${p.id}">${escapeDraftHtml(p.name)} (${p.pos})</button>`,
              )
              .join('')}
          </div>
        </div>`
      : '';

  container.innerHTML = `
    <div class="draft-advice-panel">
      ${advice.recommendation ? `<div class="alert alert-info"><strong>Recommendation:</strong> ${escapeDraftHtml(advice.recommendation)}</div>` : ''}
      ${alertsHtml ? `<div class="draft-alert-list">${alertsHtml}</div>` : ''}
      ${suggestionHtml}
    </div>`;

  if (opts.onPick) {
    container.querySelectorAll('.pick-btn[data-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onPick!((btn as HTMLElement).dataset.id!);
      });
    });
  }
}
