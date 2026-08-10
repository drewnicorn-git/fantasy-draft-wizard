import type {
  BotPersonality,
  DraftPick,
  InSeasonState,
  LeagueScoringSettings,
  RosterPositionSettings,
  ScoringFormat,
  SourceKey,
  TagDefinition,
  SheetState,
} from '../data/types';
import { getActiveLeague, updateActiveLeague } from '../state/leaguesStore';
import { normalizeRosterPositions, normalizeScoringSettings, scoringSettingsToLegacyFormat } from '../utils/leagueSettings';

export const PRESET_TAGS: TagDefinition[] = [
  { id: 'target', label: 'Target', color: '#2ecc71', description: 'Players you want to draft', preset: true },
  { id: 'avoid', label: 'Avoid', color: '#e74c3c', description: 'Players to skip', preset: true },
  { id: 'sleeper', label: 'Sleeper', color: '#f0ad4e', description: 'Undervalued upside picks', preset: true },
];

export function loadTagDefinitions(): TagDefinition[] {
  const custom = getActiveLeague().customTagDefinitions;
  const presetIds = new Set(PRESET_TAGS.map((t) => t.id));
  return [...PRESET_TAGS, ...custom.filter((t) => !presetIds.has(t.id))];
}

export function saveCustomTagDefinitions(custom: TagDefinition[]): void {
  updateActiveLeague({ customTagDefinitions: custom.filter((t) => !t.preset) });
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
  return { ...getActiveLeague().playerTags };
}

export function savePlayerTags(tags: Record<string, string>): void {
  updateActiveLeague({ playerTags: tags });
}

export function setPlayerTag(playerId: string, tagId: string | null): Record<string, string> {
  const next = { ...loadPlayerTags() };
  if (tagId == null || tagId === '') delete next[playerId];
  else next[playerId] = tagId;
  savePlayerTags(next);
  return next;
}

export function loadSelectedSources(): string[] | null {
  const sources = getActiveLeague().selectedSources;
  return sources.length ? [...sources] : null;
}

export function saveSelectedSources(sources: string[]): void {
  updateActiveLeague({ selectedSources: sources as SourceKey[] });
}

export function loadDraftConfig(): { teams: number; slot: number; rounds: number } | null {
  const { teams, slot, rounds } = getActiveLeague().draftConfig;
  return { teams, slot, rounds };
}

export function saveDraftConfig(config: { teams: number; slot: number; rounds: number }): void {
  const league = getActiveLeague();
  updateActiveLeague({
    draftConfig: {
      ...league.draftConfig,
      ...config,
      scoringSettings: league.scoringSettings,
      rosterPositions: league.rosterPositions,
    },
  });
}

export function loadSheetState(): SheetState {
  return { ...getActiveLeague().sheetState };
}

export function saveSheetState(state: SheetState): void {
  updateActiveLeague({ sheetState: state });
}

export function loadTeamNames(teams: number): string[] {
  const saved = getActiveLeague().teamNames;
  return Array.from({ length: teams }, (_, i) => saved[i]?.trim() || `Team ${i + 1}`);
}

export function saveTeamNames(names: string[]): void {
  updateActiveLeague({ teamNames: names });
}

export function loadLiveDraft(): { active: boolean; picks: DraftPick[]; currentIndex: number } | null {
  const draft = getActiveLeague().liveDraft;
  return draft ? { ...draft, picks: [...draft.picks] } : null;
}

export function saveLiveDraft(draft: { active: boolean; picks: DraftPick[]; currentIndex: number } | null): void {
  updateActiveLeague({ liveDraft: draft });
}

export function getTagById(tagId: string | undefined, defs: TagDefinition[]): TagDefinition | undefined {
  if (!tagId) return undefined;
  return defs.find((t) => t.id === tagId);
}

export function loadKeepers(): Set<string> {
  return new Set(getActiveLeague().keepers);
}

export function saveKeepers(keepers: Set<string>): void {
  updateActiveLeague({ keepers: [...keepers] });
}

export function loadKeeperTeams(): Record<string, number> {
  return { ...getActiveLeague().keeperTeams };
}

export function saveKeeperTeams(teams: Record<string, number>): void {
  updateActiveLeague({ keeperTeams: teams });
}

export function getKeeperTeam(playerId: string, defaultTeamIndex = 0): number {
  const teams = loadKeeperTeams();
  const value = teams[playerId];
  return typeof value === 'number' && value >= 0 ? value : defaultTeamIndex;
}

export function setKeeperTeam(playerId: string, teamIndex: number): void {
  const teams = loadKeeperTeams();
  teams[playerId] = teamIndex;
  saveKeeperTeams(teams);
}

export function toggleKeeper(playerId: string, defaultTeamIndex = 0): Set<string> {
  const next = loadKeepers();
  const teams = loadKeeperTeams();
  if (next.has(playerId)) {
    next.delete(playerId);
    delete teams[playerId];
  } else {
    next.add(playerId);
    teams[playerId] = defaultTeamIndex;
  }
  saveKeepers(next);
  saveKeeperTeams(teams);
  return next;
}

export function isKeeper(playerId: string): boolean {
  return loadKeepers().has(playerId);
}

export function loadInSeasonState(): InSeasonState | null {
  const state = getActiveLeague().inSeason;
  return state ? { ...state } : null;
}

export function saveInSeasonState(state: InSeasonState | null): void {
  updateActiveLeague({ inSeason: state });
}

export function clearInSeasonState(): void {
  saveInSeasonState(null);
}

export function loadScoringSettings(): LeagueScoringSettings {
  return { ...getActiveLeague().scoringSettings };
}

export function loadRosterPositions(): RosterPositionSettings {
  return { ...getActiveLeague().rosterPositions };
}

export function saveScoringSettings(settings: LeagueScoringSettings): void {
  const scoringSettings = normalizeScoringSettings(settings);
  const scoring = scoringSettingsToLegacyFormat(scoringSettings);
  const league = getActiveLeague();
  updateActiveLeague({
    scoring,
    scoringSettings,
    draftConfig: { ...league.draftConfig, scoring, scoringSettings },
  });
}

export function saveRosterPositions(positions: RosterPositionSettings): void {
  const rosterPositions = normalizeRosterPositions(positions);
  const league = getActiveLeague();
  updateActiveLeague({
    rosterPositions,
    draftConfig: { ...league.draftConfig, rosterPositions },
  });
}

export function saveScoring(scoring: ScoringFormat): void {
  saveScoringSettings({ receptionPoints: scoring === 'std' ? 0 : 1 });
}

export function saveBotPersonality(personality: BotPersonality): void {
  updateActiveLeague({ botPersonality: personality });
}

export function loadDepthChartTeam(fallback: string): string {
  return getActiveLeague().depthChartTeam ?? fallback;
}

export function saveDepthChartTeam(team: string): void {
  updateActiveLeague({ depthChartTeam: team });
}
