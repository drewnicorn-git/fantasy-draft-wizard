import { state, updateDraftConfig } from '../state/appState';

export function renderLeagueSettings(container: HTMLElement, onChange: () => void): void {
  const cfg = state.draftConfig;

  container.innerHTML = `
    <div class="league-settings">
      <span class="label">Your league</span>
      <div class="league-settings-grid">
        <label>Teams
          <input type="number" id="lg-teams" min="8" max="14" value="${cfg.teams}" />
        </label>
        <label>Draft slot
          <input type="number" id="lg-slot" min="1" max="${cfg.teams}" value="${cfg.slot}" />
        </label>
        <label>Rounds
          <input type="number" id="lg-rounds" min="15" max="20" value="${cfg.rounds}" />
        </label>
      </div>
      <p class="hint">Yellow lines mark the end of each draft round (every ${cfg.teams} players). Pick badges show expected players at your snake-draft slots.</p>
    </div>`;

  const teamsInput = container.querySelector('#lg-teams') as HTMLInputElement;
  const slotInput = container.querySelector('#lg-slot') as HTMLInputElement;
  const roundsInput = container.querySelector('#lg-rounds') as HTMLInputElement;

  const sync = (): void => {
    const teams = Math.max(8, Math.min(14, Number(teamsInput.value) || 12));
    const slot = Math.max(1, Math.min(teams, Number(slotInput.value) || 1));
    const rounds = Math.max(15, Math.min(20, Number(roundsInput.value) || 15));
    teamsInput.value = String(teams);
    slotInput.value = String(slot);
    slotInput.max = String(teams);
    roundsInput.value = String(rounds);
    updateDraftConfig(teams, slot, rounds);
    onChange();
  };

  teamsInput.addEventListener('change', sync);
  slotInput.addEventListener('change', sync);
  roundsInput.addEventListener('change', sync);
}
