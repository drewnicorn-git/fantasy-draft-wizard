import type { DraftConfig, DraftPick, Player, ScoringFormat } from '../data/types';
import { countRoster, rosterNeedScore, ROSTER_LIMITS } from '../sim/bot';
import { getConsensus } from './scoring';
import { byeWeekConflicts, detectPositionalRun } from './analytics';
import { picksUntilNextUserPick, roundFromOverall } from '../sim/snake';

export interface DraftAdvice {
  alerts: string[];
  recommendation: string;
  suggestedPicks: Player[];
}

const RUN_POSITIONS = ['RB', 'WR', 'TE', 'QB'] as const;
const SKILL_POSITIONS = ['RB', 'WR', 'TE', 'QB', 'K', 'DST'] as const;

function getAdpOrConsensus(p: Player, scoring: ScoringFormat): number | null {
  return p.adp[scoring] ?? getConsensus(p, scoring);
}

function pureValueScore(p: Player, overallPick: number, scoring: ScoringFormat): number {
  const adp = getAdpOrConsensus(p, scoring) ?? 999;
  const adpScore = Math.exp(-adp / 75);
  const diff = adp - overallPick;
  let reach = 1;
  if (diff > 18) reach = 0.5;
  else if (diff > 12) reach = 0.72;
  else if (diff < -18) reach = 1.12;
  else if (diff < -8) reach = 1.06;
  return adpScore * reach;
}

function scorePlayerForUser(
  p: Player,
  overallPick: number,
  round: number,
  counts: ReturnType<typeof countRoster>,
  config: DraftConfig,
): number {
  const scoring = config.scoring;
  const need = rosterNeedScore(p.pos, counts, round, 'balanced');
  return pureValueScore(p, overallPick, scoring) * need;
}

function isStarterMissing(pos: string, counts: ReturnType<typeof countRoster>): boolean {
  if (pos === 'QB') return counts.QB < ROSTER_LIMITS.QB;
  if (pos === 'RB') return counts.RB < ROSTER_LIMITS.RB;
  if (pos === 'WR') return counts.WR < ROSTER_LIMITS.WR;
  if (pos === 'TE') return counts.TE < ROSTER_LIMITS.TE;
  if (pos === 'K') return counts.K < ROSTER_LIMITS.K;
  if (pos === 'DST') return counts.DST < ROSTER_LIMITS.DST;
  return false;
}

function qualityBeforeNextPick(
  available: Player[],
  pos: string,
  overall: number,
  untilNext: number,
  scoring: ScoringFormat,
): Player[] {
  const horizon = overall + Math.max(untilNext, 1) + 3;
  return available
    .filter((p) => p.pos === pos)
    .filter((p) => {
      const rank = getAdpOrConsensus(p, scoring);
      return rank != null && rank <= horizon;
    })
    .sort((a, b) => (getAdpOrConsensus(a, scoring) ?? 9999) - (getAdpOrConsensus(b, scoring) ?? 9999));
}

function leaguePosPressure(allPicks: DraftPick[], pos: string, window = 8): number {
  const recent = allPicks.slice(-window);
  if (!recent.length) return 0;
  return recent.filter((p) => p.pos === pos).length / recent.length;
}

interface PositionTarget {
  pos: (typeof SKILL_POSITIONS)[number];
  score: number;
  best: Player;
  pool: Player[];
  need: number;
  starterMissing: boolean;
}

function analyzePositionTargets(
  roster: Player[],
  available: Player[],
  overall: number,
  untilNext: number,
  config: DraftConfig,
  allPicks: DraftPick[],
): PositionTarget[] {
  const counts = countRoster(roster);
  const { round } = roundFromOverall(overall, config.teams);
  const scoring = config.scoring;

  const targets: PositionTarget[] = [];
  for (const pos of SKILL_POSITIONS) {
    const need = rosterNeedScore(pos, counts, round, 'balanced');
    const pool = qualityBeforeNextPick(available, pos, overall, untilNext, scoring);
    const best = pool[0];
    if (!best || need < 0.08) continue;

    const starterMissing = isStarterMissing(pos, counts);
    const value = pureValueScore(best, overall, scoring);
    const scarcity = untilNext / Math.max(pool.length, 1);
    const pressure = leaguePosPressure(allPicks, pos);

    let score = value * need * (1 + scarcity * 0.35 + pressure * 0.25);
    if (starterMissing && round <= 10) score *= 1.35;
    if (!starterMissing && pos !== 'K' && pos !== 'DST') score *= 0.6;

    targets.push({ pos, score, best, pool, need, starterMissing });
  }

  return targets.sort((a, b) => b.score - a.score);
}

function recommendPosition(
  roster: Player[],
  available: Player[],
  overall: number,
  config: DraftConfig,
  allPicks: DraftPick[],
): string {
  const untilNext = picksUntilNextUserPick(overall, config.slot, config);
  const scoring = config.scoring;
  const skillAvailable = available.filter((p) => SKILL_POSITIONS.includes(p.pos as (typeof SKILL_POSITIONS)[number]));
  if (!skillAvailable.length) return 'No skill players left — take the best remaining option.';

  const bpa = [...skillAvailable].sort(
    (a, b) => pureValueScore(b, overall, scoring) - pureValueScore(a, overall, scoring),
  )[0];
  const bpaValue = pureValueScore(bpa, overall, scoring);

  const targets = analyzePositionTargets(roster, available, overall, untilNext, config, allPicks);
  if (!targets.length) {
    return `Best value: ${bpa.pos} — ${bpa.name} is the strongest player on the board.`;
  }

  const { round } = roundFromOverall(overall, config.teams);
  const top = targets[0];
  const critical = targets.find((t) => t.starterMissing && ['QB', 'RB', 'WR', 'TE'].includes(t.pos));
  const mustFill = critical && round >= 8 ? critical : null;

  if (mustFill && mustFill.pos !== bpa.pos && mustFill.score >= bpaValue * 0.75) {
    return `Priority: ${mustFill.pos} — starter spot still open and only ${mustFill.pool.length} ${mustFill.pos}s project to last before your next pick (${untilNext} picks away).`;
  }

  if (bpaValue > top.score * 1.12 && !top.starterMissing) {
    const waitPos = top.pos;
    const waitPool = top.pool.length;
    return `Best value: ${bpa.pos} — ${bpa.name} is worth taking now. You can wait on ${waitPos} (${waitPool} ${waitPos}s still project before pick ${overall + untilNext}).`;
  }

  if (top.starterMissing) {
    return `Priority: ${top.pos} — fill the open starter (${top.best.name} is the best ${top.pos} left; ${top.pool.length} project before your next turn).`;
  }

  if (top.pool.length <= 1 && untilNext > 2) {
    return `Priority: ${top.pos} — thin board (${top.pool.length} quality ${top.pos} left before pick ${overall + untilNext}).`;
  }

  return `Lean ${top.pos} — ${top.best.name} balances roster need with value before your next pick.`;
}

export function buildDraftAlerts(
  allPicks: DraftPick[],
  userRoster: Player[],
  available: Player[],
  overall: number,
  config: DraftConfig,
): string[] {
  const alerts: string[] = [];
  const recent = allPicks.slice(-4);
  for (const pos of RUN_POSITIONS) {
    if (detectPositionalRun(recent, pos)) alerts.push(`${pos} run — ${pos}s going fast`);
  }

  const untilNext = picksUntilNextUserPick(overall, config.slot, config);
  const scoring = config.scoring;
  for (const pos of RUN_POSITIONS) {
    const pool = qualityBeforeNextPick(available, pos, overall, untilNext, scoring);
    if (pool.length <= 1 && untilNext >= 3) {
      alerts.push(`Thin ${pos} board — only ${pool.length} quality ${pos}${pool.length === 1 ? '' : 's'} likely last until your next pick`);
    }
  }

  const byes = byeWeekConflicts(userRoster);
  if (byes.length) alerts.push(`Bye conflict weeks: ${byes.join(', ')}`);
  return alerts;
}

export function userSuggestedPicks(
  available: Player[],
  roster: Player[],
  overallPick: number,
  config: DraftConfig,
  allPicks: DraftPick[],
  limit = 3,
): Player[] {
  const { round } = roundFromOverall(overallPick, config.teams);
  const counts = countRoster(roster);
  const untilNext = picksUntilNextUserPick(overallPick, config.slot, config);
  const targets = analyzePositionTargets(roster, available, overallPick, untilNext, config, allPicks);
  const topTargetPos = new Set<string>(targets.slice(0, 2).map((t) => t.pos));

  const scored = [...available]
    .filter((p) => ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(p.pos))
    .map((p) => {
      const base = scorePlayerForUser(p, overallPick, round, counts, config);
      const boost = topTargetPos.has(p.pos) ? 1.15 : 1;
      return { p, score: base * boost };
    })
    .sort((a, b) => b.score - a.score);

  const picks: Player[] = [];
  const usedPos = new Set<string>();
  for (const entry of scored) {
    if (picks.length >= limit) break;
    if (picks.length < limit - 1 && usedPos.has(entry.p.pos) && scored.length > limit) continue;
    picks.push(entry.p);
    usedPos.add(entry.p.pos);
  }

  while (picks.length < limit && picks.length < scored.length) {
    const next = scored.find((s) => !picks.includes(s.p));
    if (!next) break;
    picks.push(next.p);
  }

  return picks;
}

export function getDraftAdvice(
  allPicks: DraftPick[],
  userRoster: Player[],
  available: Player[],
  overall: number,
  config: DraftConfig,
): DraftAdvice {
  return {
    alerts: buildDraftAlerts(allPicks, userRoster, available, overall, config),
    recommendation: recommendPosition(userRoster, available, overall, config, allPicks),
    suggestedPicks: userSuggestedPicks(available, userRoster, overall, config, allPicks),
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
