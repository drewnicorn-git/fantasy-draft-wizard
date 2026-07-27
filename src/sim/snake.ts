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
