import type { StoredMockDraft } from '../data/types';

export type { MockDraftPhase, StoredMockDraft } from '../data/types';

const STORAGE_KEY = 'fdw-mock-draft';

export function loadMockDraft(): StoredMockDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMockDraft;
    if (!parsed || !Array.isArray(parsed.picks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMockDraft(draft: StoredMockDraft | null): void {
  try {
    if (draft == null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearMockDraft(): void {
  saveMockDraft(null);
}
