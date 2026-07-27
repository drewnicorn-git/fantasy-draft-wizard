import type { PlayerTag } from '../data/types';

const TAGS_KEY = 'fdw-player-tags';

export function loadTags(): Record<string, PlayerTag> {
  try {
    return JSON.parse(localStorage.getItem(TAGS_KEY) ?? '{}') as Record<string, PlayerTag>;
  } catch {
    return {};
  }
}

export function saveTags(tags: Record<string, PlayerTag>): void {
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
}

export function toggleTag(tags: Record<string, PlayerTag>, playerId: string, tag: PlayerTag): Record<string, PlayerTag> {
  const next = { ...tags };
  if (next[playerId] === tag) delete next[playerId];
  else next[playerId] = tag;
  saveTags(next);
  return next;
}
