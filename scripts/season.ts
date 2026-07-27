export function currentDraftSeason(now = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  // NFL draft season runs roughly Feb–Sep; use current year from March onward, else prior year.
  return month >= 2 ? year : year - 1;
}
