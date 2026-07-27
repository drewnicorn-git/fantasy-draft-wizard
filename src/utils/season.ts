export function currentDraftSeason(now = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  return month >= 2 ? year : year - 1;
}
