import { mountRankingsPanel } from '../components/RankingsPanel';

export function mountRankingsView(root: HTMLElement): void {
  root.innerHTML = '<section class="panel"></section>';
  mountRankingsPanel(root.querySelector('.panel') as HTMLElement, { tableMode: 'rankings' });
}
