import type { Player, ScoringFormat } from '../data/types';
import { getInSeason } from '../state/appState';
import { getProjectedPoints } from './scoring';

function playerTradeValue(p: Player, scoring: ScoringFormat): number {
  const inSeason = getInSeason()?.players[p.id];
  if (inSeason) {
    const pts = scoring === 'ppr' ? inSeason.seasonPtsPpr : inSeason.seasonPtsStd;
    if (pts != null && pts > 0) return pts;
    const proj = scoring === 'ppr' ? inSeason.projPtsPpr : inSeason.projPtsStd;
    if (proj != null && proj > 0) return proj;
  }
  return getProjectedPoints(p) ?? 0;
}

export interface TradeAnalysis {
  giveTotal: number;
  receiveTotal: number;
  delta: number;
  verdict: string;
  grade: 'win' | 'fair' | 'loss';
}

export function analyzeTrade(give: Player[], receive: Player[], scoring: ScoringFormat): TradeAnalysis {
  const giveTotal = give.reduce((s, p) => s + playerTradeValue(p, scoring), 0);
  const receiveTotal = receive.reduce((s, p) => s + playerTradeValue(p, scoring), 0);
  const delta = receiveTotal - giveTotal;
  const pct = giveTotal > 0 ? (delta / giveTotal) * 100 : delta > 0 ? 100 : 0;

  let grade: TradeAnalysis['grade'] = 'fair';
  let verdict: string;
  if (pct >= 8) {
    grade = 'win';
    verdict = `You win this trade by about ${pct.toFixed(0)}% in projected value.`;
  } else if (pct <= -8) {
    grade = 'loss';
    verdict = `You lose this trade by about ${Math.abs(pct).toFixed(0)}% in projected value.`;
  } else {
    verdict = 'Trade is roughly fair based on rest-of-season projected value.';
  }

  return { giveTotal, receiveTotal, delta, verdict, grade };
}
