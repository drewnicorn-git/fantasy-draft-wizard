const MAX_COMPARE = 3;

let compareIds: string[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function getComparePlayerIds(): string[] {
  return [...compareIds];
}

export function isCompareSelected(playerId: string): boolean {
  return compareIds.includes(playerId);
}

export function toggleComparePlayer(playerId: string): boolean {
  if (compareIds.includes(playerId)) {
    compareIds = compareIds.filter((id) => id !== playerId);
    notify();
    return false;
  }
  if (compareIds.length >= MAX_COMPARE) {
    compareIds = [...compareIds.slice(1), playerId];
  } else {
    compareIds = [...compareIds, playerId];
  }
  notify();
  return true;
}

export function removeComparePlayer(playerId: string): void {
  if (!compareIds.includes(playerId)) return;
  compareIds = compareIds.filter((id) => id !== playerId);
  notify();
}

export function clearComparePlayers(): void {
  if (!compareIds.length) return;
  compareIds = [];
  notify();
}

export function setComparePlayerIds(ids: string[]): void {
  compareIds = ids.filter(Boolean).slice(0, MAX_COMPARE);
  notify();
}

export function subscribeComparePlayers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function parseCompareParam(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean)
    .slice(0, MAX_COMPARE);
}

export function formatCompareParam(ids: string[]): string {
  return ids.map((id) => encodeURIComponent(id)).join(',');
}
