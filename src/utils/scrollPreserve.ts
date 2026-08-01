export function findScrollContainer(root: HTMLElement): HTMLElement | null {
  const tableWrap = root.querySelector('.table-wrap') as HTMLElement | null;
  if (tableWrap && tableWrap.scrollHeight > tableWrap.clientHeight) return tableWrap;
  if (root.scrollHeight > root.clientHeight) return root;
  return tableWrap ?? root;
}

export function preserveScroll(root: HTMLElement, render: () => void): void {
  const scrollEl = findScrollContainer(root);
  const top = scrollEl?.scrollTop ?? 0;
  const left = scrollEl?.scrollLeft ?? 0;
  render();
  if (scrollEl) {
    scrollEl.scrollTop = top;
    scrollEl.scrollLeft = left;
  }
}
