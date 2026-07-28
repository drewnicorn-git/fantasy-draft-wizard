import { mountRankingsPanel } from '../components/RankingsPanel';

export function mountManualView(root: HTMLElement): void {
  root.innerHTML = '<section class="panel manual-panel"></section>';
  mountRankingsPanel(root.querySelector('.panel') as HTMLElement, {
    tableMode: 'manual',
    includeKeepers: true,
  });
}
