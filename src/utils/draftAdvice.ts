import type { DraftConfig, DraftPick, Player, ScoringFormat } from '../data/types';
import { countRoster, resolveRosterLimits, rosterNeedScore } from '../sim/bot';
import type { BotRosterLimits } from '../utils/leagueSettings';
import { getActiveLeague } from '../state/leaguesStore';
import { buildProjectedRankMap } from '../utils/fantasyPoints';
import { getAdp, getConsensus, getProjectedPoints, getValueRank } from './scoring';
import { byeWeekConflicts, detectPositionalRun } from './analytics';
import { computeReplacementLevels, formatVorp, playerVorp } from './vorp';
import { picksUntilNextUserPick, roundFromOverall } from '../sim/snake';
import { escapeHtml } from './escapeHtml';
import { posCssClass } from './position';

export interface PositionVorpPick {
  pos: string;
  player: Player;
  vorp: number;
  adp: number | null;
}

export interface DraftAdvice {
  alerts: string[];
  recommendation: string;
  suggestedPicks: Player[];
  vorpByPosition?: PositionVorpPick[];
  bestOverallVorp?: PositionVorpPick;
}

export type DraftAdviceStyle = 'classic' | 'vorp';

export interface DraftAdviceOptions {
  style?: DraftAdviceStyle;
}

const RUN_POSITIONS = ['RB', 'WR', 'TE', 'QB'] as const;

function skillPositionsForConfig(config: DraftConfig): string[] {
  const limits = resolveRosterLimits(config);
  const positions: string[] = ['RB', 'WR', 'TE', 'QB'];
  if (limits.K > 0) positions.push('K');
  if (limits.DST > 0) positions.push('DST');
  return positions;
}

function getAdpOrConsensus(p: Player, scoring: ScoringFormat): number | null {
  return getAdp(p, scoring) ?? getConsensus(p, scoring);
}

function projectedRankMapFor(available: Player[]): Map<string, number> {
  const rules = getActiveLeague().scoringSettings;
  return buildProjectedRankMap(available, rules);
}

function playerValueRank(p: Player, projectedRankMap?: Map<string, number>): number | null {
  return getValueRank(p, projectedRankMap);
}

function pureValueScore(
  p: Player,
  overallPick: number,
  scoring: ScoringFormat,
  projectedRankMap?: Map<string, number>,
): number {
  const projected = getProjectedPoints(p);
  if (projected != null) {
    const rank = playerValueRank(p, projectedRankMap);
    const adp = rank ?? getAdpOrConsensus(p, scoring) ?? 999;
    const reach = reachMultiplier(adp, overallPick);
    return (projected / 320) * reach;
  }

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

function reachMultiplier(adp: number, overallPick: number): number {
  const diff = adp - overallPick;
  if (diff > 18) return 0.5;
  if (diff > 12) return 0.72;
  if (diff < -18) return 1.12;
  if (diff < -8) return 1.06;
  return 1;
}

function scorePlayerForUser(
  p: Player,
  overallPick: number,
  round: number,
  counts: ReturnType<typeof countRoster>,
  config: DraftConfig,
  limits: BotRosterLimits,
  projectedRankMap?: Map<string, number>,
  vorp?: number | null,
): number {
  const scoring = config.scoring;
  const need = rosterNeedScore(p.pos, counts, round, 'balanced', limits);
  const vorpScore = vorp != null && vorp > 0 ? vorp / 8 : 0;
  const valueScore = pureValueScore(p, overallPick, scoring, projectedRankMap);
  return (vorpScore > 0 ? vorpScore * 0.65 + valueScore * 0.35 : valueScore) * need;
}

function isStarterMissing(pos: string, counts: ReturnType<typeof countRoster>, limits: BotRosterLimits): boolean {
  if (pos === 'QB') return counts.QB < limits.QB + limits.SUPERFLEX;
  if (pos === 'RB') return counts.RB < limits.RB;
  if (pos === 'WR') return counts.WR < limits.WR;
  if (pos === 'TE') return counts.TE < limits.TE;
  if (pos === 'K') return limits.K > 0 && counts.K < limits.K;
  if (pos === 'DST') return limits.DST > 0 && counts.DST < limits.DST;
  return false;
}

function qualityBeforeNextPick(
  available: Player[],
  pos: string,
  overall: number,
  untilNext: number,
  scoring: ScoringFormat,
  projectedRankMap?: Map<string, number>,
): Player[] {
  const horizon = overall + Math.max(untilNext, 1) + 3;
  const rankFor = (p: Player): number | null =>
    playerValueRank(p, projectedRankMap) ?? getAdpOrConsensus(p, scoring);
  return available
    .filter((p) => p.pos === pos)
    .filter((p) => {
      const rank = rankFor(p);
      return rank != null && rank <= horizon;
    })
    .sort((a, b) => (rankFor(a) ?? 9999) - (rankFor(b) ?? 9999));
}

function leaguePosPressure(allPicks: DraftPick[], pos: string, window = 8): number {
  const recent = allPicks.slice(-window);
  if (!recent.length) return 0;
  return recent.filter((p) => p.pos === pos).length / recent.length;
}

interface PositionTarget {
  pos: string;
  score: number;
  best: Player;
  pool: Player[];
  need: number;
  starterMissing: boolean;
}

function getCriticalTarget(
  roster: Player[],
  available: Player[],
  overall: number,
  config: DraftConfig,
  allPicks: DraftPick[],
  projectedRankMap: Map<string, number>,
): PositionTarget | null {
  const untilNext = picksUntilNextUserPick(overall, config.slot, config);
  const targets = analyzePositionTargets(
    roster,
    available,
    overall,
    untilNext,
    config,
    allPicks,
    projectedRankMap,
  );
  return targets[0] ?? null;
}

function shouldTakeBpaOverTarget(
  bpaValue: number,
  target: PositionTarget,
  overall: number,
  config: DraftConfig,
): boolean {
  const { round } = roundFromOverall(overall, config.teams);
  if (target.starterMissing && round >= 8) return bpaValue > target.score * 1.25;
  if (target.starterMissing) return bpaValue > target.score * 1.15;
  return bpaValue > target.score * 1.12;
}

function analyzePositionTargets(
  roster: Player[],
  available: Player[],
  overall: number,
  untilNext: number,
  config: DraftConfig,
  allPicks: DraftPick[],
  projectedRankMap: Map<string, number>,
): PositionTarget[] {
  const counts = countRoster(roster);
  const { round } = roundFromOverall(overall, config.teams);
  const scoring = config.scoring;
  const limits = resolveRosterLimits(config);

  const targets: PositionTarget[] = [];
  for (const pos of skillPositionsForConfig(config)) {
    const need = rosterNeedScore(pos, counts, round, 'balanced', limits);
    const pool = qualityBeforeNextPick(available, pos, overall, untilNext, scoring, projectedRankMap);
    const best = pool[0];
    if (!best || need < 0.08) continue;

    const starterMissing = isStarterMissing(pos, counts, limits);
    const value = pureValueScore(best, overall, scoring, projectedRankMap);
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
  available: Player[],
  overall: number,
  config: DraftConfig,
  criticalTarget: PositionTarget | null,
  projectedRankMap: Map<string, number>,
): string {
  const untilNext = picksUntilNextUserPick(overall, config.slot, config);
  const scoring = config.scoring;
  const skillAvailable = available.filter((p) => skillPositionsForConfig(config).includes(p.pos));
  if (!skillAvailable.length) return 'No skill players left — take the best remaining option.';

  const bpa = [...skillAvailable].sort(
    (a, b) => pureValueScore(b, overall, scoring, projectedRankMap) - pureValueScore(a, overall, scoring, projectedRankMap),
  )[0];
  const bpaValue = pureValueScore(bpa, overall, scoring, projectedRankMap);

  if (!criticalTarget) {
    return `Best value: ${bpa.pos} — ${bpa.name} is the strongest player available.`;
  }

  if (shouldTakeBpaOverTarget(bpaValue, criticalTarget, overall, config)) {
    return `Best value: ${bpa.pos} — ${bpa.name} is the strongest player available.`;
  }

  const { pos, best, pool, starterMissing } = criticalTarget;
  if (starterMissing) {
    return `Target ${pos} — fill the open starter (${best.name}; ${pool.length} quality ${pos}${pool.length === 1 ? '' : 's'} before your next pick).`;
  }

  if (pool.length <= 1 && untilNext > 2) {
    return `Target ${pos} — thin board (${pool.length} quality ${pos} left before pick ${overall + untilNext}).`;
  }

  return `Target ${pos} — ${best.name} is the priority before your next pick.`;
}

export function buildDraftAlerts(
  allPicks: DraftPick[],
  userRoster: Player[],
  overall: number,
  config: DraftConfig,
  criticalTarget: PositionTarget | null,
): string[] {
  const alerts: string[] = [];
  const recent = allPicks.slice(-4);
  for (const pos of RUN_POSITIONS) {
    if (detectPositionalRun(recent, pos)) alerts.push(`${pos} run — ${pos}s going fast`);
  }

  if (criticalTarget) {
    const untilNext = picksUntilNextUserPick(overall, config.slot, config);
    const { pos, pool } = criticalTarget;
    if (
      RUN_POSITIONS.includes(pos as (typeof RUN_POSITIONS)[number]) &&
      pool.length <= 1 &&
      untilNext >= 3
    ) {
      alerts.push(
        `Thin ${pos} board — only ${pool.length} quality ${pos}${pool.length === 1 ? '' : 's'} likely last until your next pick`,
      );
    }
  }

  const byes = byeWeekConflicts(userRoster);
  if (byes.length) alerts.push(`Bye conflict weeks: ${byes.join(', ')}`);
  return alerts;
}

const VORP_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

function rankPlayersByVorp(
  available: Player[],
  config: DraftConfig,
  levels: ReturnType<typeof computeReplacementLevels>,
): { p: Player; vorp: number }[] {
  return [...available]
    .map((p) => ({ p, vorp: playerVorp(p, levels, config.scoringSettings) }))
    .filter((x): x is { p: Player; vorp: number } => x.vorp != null && x.vorp > 0)
    .sort((a, b) => b.vorp - a.vorp);
}

function buildVorpByPosition(
  available: Player[],
  config: DraftConfig,
  levels: ReturnType<typeof computeReplacementLevels>,
): PositionVorpPick[] {
  const scoring = config.scoring;
  const picks: PositionVorpPick[] = [];
  for (const pos of VORP_POSITIONS) {
    const best = available
      .filter((p) => p.pos === pos)
      .map((p) => ({ p, vorp: playerVorp(p, levels, config.scoringSettings) }))
      .filter((x): x is { p: Player; vorp: number } => x.vorp != null && x.vorp > 0)
      .sort((a, b) => b.vorp - a.vorp)[0];
    if (best) {
      picks.push({
        pos,
        player: best.p,
        vorp: best.vorp,
        adp: getAdp(best.p, scoring) ?? null,
      });
    }
  }
  return picks.sort((a, b) => b.vorp - a.vorp);
}

function buildVorpRecommendation(ranked: { p: Player; vorp: number }[]): string {
  if (!ranked.length) return 'No VORP projection available — use consensus or ADP.';

  const top = ranked[0];
  if (ranked.length >= 2) {
    const second = ranked[1];
    return `Take ${top.p.name} (${formatVorp(top.vorp)}) — best VORP over ${second.p.name} (${formatVorp(second.vorp)}).`;
  }
  return `Take ${top.p.name} (${formatVorp(top.vorp)}) — highest VORP available.`;
}

function toOverallVorpPick(
  entry: { p: Player; vorp: number },
  config: DraftConfig,
): PositionVorpPick {
  return {
    pos: String(entry.p.pos),
    player: entry.p,
    vorp: entry.vorp,
    adp: getAdp(entry.p, config.scoring) ?? null,
  };
}

export function userSuggestedPicks(
  available: Player[],
  roster: Player[],
  overallPick: number,
  config: DraftConfig,
  criticalTarget: PositionTarget | null,
  projectedRankMap: Map<string, number>,
  limit = 3,
): Player[] {
  const { round } = roundFromOverall(overallPick, config.teams);
  const counts = countRoster(roster);
  const scoring = config.scoring;
  const limits = resolveRosterLimits(config);
  const levels = computeReplacementLevels(available, config, config.scoringSettings);
  const skillAvailable = available.filter((p) => {
    if (p.pos === 'K') return limits.K > 0;
    if (p.pos === 'DST') return limits.DST > 0;
    return ['QB', 'RB', 'WR', 'TE'].includes(p.pos);
  });

  const bpa = [...skillAvailable].sort(
    (a, b) =>
      pureValueScore(b, overallPick, scoring, projectedRankMap) -
      pureValueScore(a, overallPick, scoring, projectedRankMap),
  )[0];
  const bpaValue = bpa ? pureValueScore(bpa, overallPick, scoring, projectedRankMap) : 0;
  const useBpa =
    !criticalTarget ||
    !bpa ||
    shouldTakeBpaOverTarget(bpaValue, criticalTarget, overallPick, config);

  if (useBpa) {
    return [...skillAvailable]
      .map((p) => ({
        p,
        score: scorePlayerForUser(
          p,
          overallPick,
          round,
          counts,
          config,
          limits,
          projectedRankMap,
          playerVorp(p, levels, config.scoringSettings),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.p);
  }

  return available
    .filter((p) => p.pos === criticalTarget!.pos)
    .map((p) => ({
      p,
      score: scorePlayerForUser(
        p,
        overallPick,
        round,
        counts,
        config,
        limits,
        projectedRankMap,
        playerVorp(p, levels, config.scoringSettings),
      ),
    }))
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
  options: DraftAdviceOptions = {},
): DraftAdvice {
  const style = options.style ?? 'classic';
  const projectedRankMap = projectedRankMapFor(available);
  const levels = computeReplacementLevels(available, config, config.scoringSettings);
  const criticalTarget = getCriticalTarget(
    userRoster,
    available,
    overall,
    config,
    allPicks,
    projectedRankMap,
  );

  const recommendation =
    style === 'vorp'
      ? buildVorpRecommendation(rankPlayersByVorp(available, config, levels))
      : recommendPosition(available, overall, config, criticalTarget, projectedRankMap);

  let vorpByPosition: PositionVorpPick[] | undefined;
  let bestOverallVorp: PositionVorpPick | undefined;
  let suggestedPicks: Player[];

  if (style === 'vorp') {
    vorpByPosition = buildVorpByPosition(available, config, levels);
    const ranked = rankPlayersByVorp(available, config, levels);
    bestOverallVorp = ranked[0] ? toOverallVorpPick(ranked[0], config) : undefined;
    suggestedPicks = vorpByPosition.map((x) => x.player);
  } else {
    suggestedPicks = userSuggestedPicks(
      available,
      userRoster,
      overall,
      config,
      criticalTarget,
      projectedRankMap,
    );
  }

  return {
    alerts: buildDraftAlerts(allPicks, userRoster, overall, config, criticalTarget),
    recommendation,
    suggestedPicks,
    vorpByPosition,
    bestOverallVorp,
  };
}

export function renderDraftAdvicePanel(
  container: HTMLElement,
  advice: DraftAdvice,
  opts: { onPick?: (playerId: string) => void; showSuggestions?: boolean } = {},
): void {
  const showSuggestions = opts.showSuggestions ?? !!opts.onPick;
  const alertsHtml = advice.alerts.map((a) => `<div class="alert">${escapeHtml(a)}</div>`).join('');

  const vorpPositionHtml =
    advice.vorpByPosition?.length
      ? `<div class="vorp-by-position">
          <h4>Best VORP by position</h4>
          <p class="hint vorp-hint">Raw VORP measures value over replacement, not roster need — compare ADP across positions below.</p>
          <div class="vorp-position-grid">
            ${advice.vorpByPosition
              .map((entry) => {
                const adpLabel = entry.adp != null ? `ADP ${entry.adp.toFixed(1)}` : 'ADP —';
                const pickBtn = opts.onPick
                  ? `<button type="button" class="chip pick-btn vorp-pick-btn" data-id="${escapeHtml(entry.player.id)}">Draft</button>`
                  : '';
                return `<div class="vorp-position-card ${posCssClass(entry.pos)}">
                  <span class="pos-badge ${posCssClass(entry.pos)}">${escapeHtml(entry.pos)}</span>
                  <span class="vorp-player-name">${escapeHtml(entry.player.name)}</span>
                  <span class="vorp-metrics">${formatVorp(entry.vorp)} · ${escapeHtml(adpLabel)}</span>
                  ${pickBtn}
                </div>`;
              })
              .join('')}
          </div>
        </div>`
      : '';

  const overallVorpHtml =
    advice.bestOverallVorp
      ? `<div class="alert alert-info vorp-overall">
          <strong>Overall best VORP:</strong>
          ${escapeHtml(advice.bestOverallVorp.player.name)}
          (${escapeHtml(String(advice.bestOverallVorp.pos))}, ${formatVorp(advice.bestOverallVorp.vorp)}${advice.bestOverallVorp.adp != null ? `, ADP ${advice.bestOverallVorp.adp.toFixed(1)}` : ''})
          ${opts.onPick ? `<button type="button" class="chip pick-btn vorp-pick-btn" data-id="${escapeHtml(advice.bestOverallVorp.player.id)}">Draft</button>` : ''}
        </div>`
      : advice.recommendation
        ? `<div class="alert alert-info"><strong>Overall best VORP:</strong> ${escapeHtml(advice.recommendation)}</div>`
        : '';

  const suggestionHtml =
    showSuggestions && advice.suggestedPicks.length && !advice.vorpByPosition?.length
      ? `<div class="draft-suggestions">
          <h4>Suggested picks</h4>
          <div class="suggestion-chips">
            ${advice.suggestedPicks
              .map(
                (p) =>
                  `<button type="button" class="chip pick-btn" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(String(p.pos))})</button>`,
              )
              .join('')}
          </div>
        </div>`
      : '';

  container.innerHTML = `
    <div class="draft-advice-panel">
      ${vorpPositionHtml}
      ${overallVorpHtml}
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
