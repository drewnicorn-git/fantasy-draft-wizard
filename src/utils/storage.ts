import type { DraftPick, TagDefinition } from '../data/types';

const TAG_DEFS_KEY = 'fdw-tag-definitions';
const PLAYER_TAGS_KEY = 'fdw-player-tags';
const SELECTED_SOURCES_KEY = 'fdw-selected-sources';
const DRAFT_CONFIG_KEY = 'fdw-draft-config';
const SHEET_STATE_KEY = 'fdw-sheet-state';
const TEAM_NAMES_KEY = 'fdw-team-names';
const LIVE_DRAFT_KEY = 'fdw-live-draft';

export const PRESET_TAGS: TagDefinition[] = [
  { id: 'target', label: 'Target', color: '#2ecc71', description: 'Players you want to draft', preset: true },
  { id: 'avoid', label: 'Avoid', color: '#e74c3c', description: 'Players to skip', preset: true },
  { id: 'sleeper', label: 'Sleeper', color: '#f0ad4e', description: 'Undervalued upside picks', preset: true },
];

export function loadTagDefinitions(): TagDefinition[] {
  try {
    const custom = JSON.parse(localStorage.getItem(TAG_DEFS_KEY) ?? '[]') as TagDefinition[];
    const presetIds = new Set(PRESET_TAGS.map((t) => t.id));
    const merged = [...PRESET_TAGS, ...custom.filter((t) => !presetIds.has(t.id))];
    return merged;
  } catch {
    return [...PRESET_TAGS];
  }
}

export function saveCustomTagDefinitions(custom: TagDefinition[]): void {
  const nonPreset = custom.filter((t) => !t.preset);
  localStorage.setItem(TAG_DEFS_KEY, JSON.stringify(nonPreset));
}

export function addCustomTag(label: string, color: string): TagDefinition {
  const id = `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
  const tag: TagDefinition = { id, label, color, description: 'Custom tag' };
  const custom = loadTagDefinitions().filter((t) => !t.preset);
  custom.push(tag);
  saveCustomTagDefinitions(custom);
  return tag;
}

export function removeCustomTag(tagId: string): void {
  const custom = loadTagDefinitions().filter((t) => !t.preset && t.id !== tagId);
  saveCustomTagDefinitions(custom);
  const assignments = loadPlayerTags();
  for (const [playerId, tid] of Object.entries(assignments)) {
    if (tid === tagId) delete assignments[playerId];
  }
  savePlayerTags(assignments);
}

export function loadPlayerTags(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_TAGS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function savePlayerTags(tags: Record<string, string>): void {
  localStorage.setItem(PLAYER_TAGS_KEY, JSON.stringify(tags));
}

export function setPlayerTag(playerId: string, tagId: string | null): Record<string, string> {
  const next = { ...loadPlayerTags() };
  if (tagId == null || tagId === '') delete next[playerId];
  else next[playerId] = tagId;
  savePlayerTags(next);
  return next;
}

export function loadSelectedSources(): string[] | null {
  try {
    const raw = localStorage.getItem(SELECTED_SOURCES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

export function saveSelectedSources(sources: string[]): void {
  localStorage.setItem(SELECTED_SOURCES_KEY, JSON.stringify(sources));
}

export function loadDraftConfig(): { teams: number; slot: number; rounds: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as { teams: number; slot: number; rounds: number }) : null;
  } catch {
    return null;
  }
}

export function saveDraftConfig(config: { teams: number; slot: number; rounds: number }): void {
  localStorage.setItem(DRAFT_CONFIG_KEY, JSON.stringify(config));
}

export function loadSheetState(): { locked: boolean; tierOverrides: Record<string, number>; savedAt: string | null } {
  try {
    const raw = localStorage.getItem(SHEET_STATE_KEY);
    if (!raw) return { locked: false, tierOverrides: {}, savedAt: null };
    return JSON.parse(raw) as { locked: boolean; tierOverrides: Record<string, number>; savedAt: string | null };
  } catch {
    return { locked: false, tierOverrides: {}, savedAt: null };
  }
}

export function saveSheetState(state: { locked: boolean; tierOverrides: Record<string, number>; savedAt: string | null }): void {
  localStorage.setItem(SHEET_STATE_KEY, JSON.stringify(state));
}

export function loadTeamNames(teams: number): string[] {
  try {
    const raw = localStorage.getItem(TEAM_NAMES_KEY);
    const saved = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.from({ length: teams }, (_, i) => saved[i]?.trim() || `Team ${i + 1}`);
  } catch {
    return Array.from({ length: teams }, (_, i) => `Team ${i + 1}`);
  }
}

export function saveTeamNames(names: string[]): void {
  localStorage.setItem(TEAM_NAMES_KEY, JSON.stringify(names));
}

export function loadLiveDraft(): { active: boolean; picks: DraftPick[]; currentIndex: number } | null {
  try {
    const raw = localStorage.getItem(LIVE_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as { active: boolean; picks: DraftPick[]; currentIndex: number }) : null;
  } catch {
    return null;
  }
}

export function saveLiveDraft(draft: { active: boolean; picks: DraftPick[]; currentIndex: number } | null): void {
  if (draft == null) localStorage.removeItem(LIVE_DRAFT_KEY);
  else localStorage.setItem(LIVE_DRAFT_KEY, JSON.stringify(draft));
}

export function getTagById(tagId: string | undefined, defs: TagDefinition[]): TagDefinition | undefined {
  if (!tagId) return undefined;
  return defs.find((t) => t.id === tagId);
}
