export function formatSignedDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function rankDelta(referenceRank: number, compareRank: number | null): number | null {
  if (compareRank == null) return null;
  return referenceRank - compareRank;
}

export function formatRankDeltaCell(referenceRank: number, compareRank: number | null): string {
  const delta = rankDelta(referenceRank, compareRank);
  if (delta == null) return '—';
  const cls = delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : 'delta-zero';
  return `<span class="${cls}">${formatSignedDelta(delta)}</span>`;
}
