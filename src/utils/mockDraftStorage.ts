import type { StoredMockDraft } from '../data/types';
import { getActiveLeague, updateActiveLeague } from '../state/leaguesStore';

export type { MockDraftPhase, StoredMockDraft } from '../data/types';

export function loadMockDraft(): StoredMockDraft | null {
  const draft = getActiveLeague().mockDraft;
  if (!draft || !Array.isArray(draft.picks)) return null;
  return {
    ...draft,
    picks: [...draft.picks],
    draftedIds: [...draft.draftedIds],
    history: draft.history.map((h) => [...h]),
  };
}

export function saveMockDraft(draft: StoredMockDraft | null): void {
  updateActiveLeague({ mockDraft: draft });
}

export function clearMockDraft(): void {
  saveMockDraft(null);
}
