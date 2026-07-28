import type { DraftConfig } from '../data/types';

export function snakePickOrder(config: DraftConfig): number[] {
  const order: number[] = [];
  for (let r = 0; r < config.rounds; r++) {
    const forward = r % 2 === 0;
    for (let t = 0; t < config.teams; t++) {
      order.push(forward ? t : config.teams - 1 - t);
    }
  }
  return order;
}

export function pickNumber(round: number, pickInRound: number, teams: number): number {
  return (round - 1) * teams + pickInRound;
}

export function roundFromOverall(overall: number, teams: number): { round: number; pickInRound: number } {
  const round = Math.ceil(overall / teams);
  const pickInRound = overall - (round - 1) * teams;
  return { round, pickInRound };
}

export function picksUntilNextUserPick(currentOverall: number, userTeamIndex: number, config: DraftConfig): number {
  const order = snakePickOrder(config);
  const idx = currentOverall - 1;
  for (let i = idx + 1; i < order.length; i++) {
    if (order[i] === userTeamIndex - 1) return i - idx;
  }
  return 0;
}

/** Overall pick numbers (1-based) for the user's slot in a snake draft. */
export function getUserPickNumbers(teams: number, slot: number, rounds: number): number[] {
  const picks: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const forward = r % 2 === 0;
    const pickInRound = forward ? slot : teams - slot + 1;
    picks.push(r * teams + pickInRound);
  }
  return picks;
}

export function getRemainingUserPickNumbers(
  currentOverall: number,
  teams: number,
  slot: number,
  rounds: number,
): number[] {
  return getUserPickNumbers(teams, slot, rounds).filter((p) => p >= currentOverall);
}

/** Map an available-board row to the draft pick that row represents. */
export function projectedPickOverall(availableRank: number, currentOverall: number): number {
  return currentOverall + availableRank - 1;
}

export function isUserProjectedPick(
  availableRank: number,
  currentOverall: number,
  teams: number,
  slot: number,
  rounds: number,
): boolean {
  const projected = projectedPickOverall(availableRank, currentOverall);
  return getUserPickNumbers(teams, slot, rounds).includes(projected);
}

export function isProjectedRoundBreak(availableRank: number, currentOverall: number, teams: number): boolean {
  return projectedPickOverall(availableRank, currentOverall) % teams === 0;
}

export function formatPickLabel(overall: number, teams: number): string {
  const { round, pickInRound } = roundFromOverall(overall, teams);
  return `R${round}.${String(pickInRound).padStart(2, '0')}`;
}
