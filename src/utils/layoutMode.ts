export type LayoutMode = 'desktop' | 'mobile';

const STORAGE_KEY = 'fdw-layout-mode';

export function loadLayoutMode(): LayoutMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'mobile' ? 'mobile' : 'desktop';
  } catch {
    return 'desktop';
  }
}

export function saveLayoutMode(mode: LayoutMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore quota errors */
  }
  applyLayoutMode(mode);
}

export function applyLayoutMode(mode: LayoutMode): void {
  document.documentElement.classList.toggle('layout-mobile', mode === 'mobile');
  document.documentElement.dataset.layout = mode;
}

export function toggleLayoutMode(): LayoutMode {
  const next: LayoutMode = loadLayoutMode() === 'mobile' ? 'desktop' : 'mobile';
  saveLayoutMode(next);
  return next;
}
