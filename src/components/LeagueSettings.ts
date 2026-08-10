import type { RosterPositionSettings } from '../data/types';
import { state, setScoringSettings, setRosterPositions, updateDraftConfig } from '../state/appState';
import { getActiveLeague } from '../state/leaguesStore';
import {
  normalizeReceptionPoints,
  normalizeRosterPositions,
  rosterPositionsSummary,
  rosterTotalSize,
  ROSTER_PRESETS,
  SCORING_PRESETS,
  scoringSettingsLabel,
  suggestedDraftRounds,
} from '../utils/leagueSettings';
import { escapeHtml } from '../utils/escapeHtml';

const ROSTER_FIELDS: { key: keyof RosterPositionSettings; label: string; max: number }[] = [
  { key: 'QB', label: 'QB', max: 2 },
  { key: 'RB', label: 'RB', max: 5 },
  { key: 'WR', label: 'WR', max: 5 },
  { key: 'TE', label: 'TE', max: 3 },
  { key: 'FLEX', label: 'FLEX', max: 3 },
  { key: 'SUPERFLEX', label: 'SF', max: 2 },
  { key: 'K', label: 'K', max: 2 },
  { key: 'DST', label: 'DST', max: 2 },
  { key: 'BENCH', label: 'BN', max: 10 },
];

export function renderLeagueSettings(container: HTMLElement, onChange: () => void): void {
  const cfg = state.draftConfig;
  const league = getActiveLeague();
  const positions = league.rosterPositions;
  const scoringLabel = scoringSettingsLabel(league.scoringSettings);
  const rosterSize = rosterTotalSize(positions);
  const suggestedRounds = suggestedDraftRounds(positions);

  container.innerHTML = `
    <div class="league-settings">
      <span class="label">League rules</span>
      <div class="league-settings-grid">
        <label>Teams
          <input type="number" id="lg-teams" min="8" max="14" value="${cfg.teams}" />
        </label>
        <label>Draft slot
          <input type="number" id="lg-slot" min="1" max="${cfg.teams}" value="${cfg.slot}" />
        </label>
        <label>Rounds
          <input type="number" id="lg-rounds" min="10" max="24" value="${cfg.rounds}" />
        </label>
      </div>

      <div class="league-rules-section">
        <span class="sub-label">Scoring</span>
        <div class="scoring-preset-row" role="group" aria-label="Scoring preset">
          ${SCORING_PRESETS.map(
            (preset) => `<button type="button" class="chip scoring-preset${league.scoringSettings.receptionPoints === preset.settings.receptionPoints ? ' active' : ''}" data-reception="${preset.settings.receptionPoints}">${escapeHtml(preset.label)}</button>`,
          ).join('')}
        </div>
        <label class="custom-scoring-label">Custom PPR/rec
          <input type="number" id="lg-reception" min="0" max="2" step="0.25" value="${league.scoringSettings.receptionPoints}" />
        </label>
        <p class="hint">Rankings blend Standard and Full PPR sources for half/custom PPR leagues. Current: ${escapeHtml(scoringLabel)}.</p>
      </div>

      <div class="league-rules-section">
        <span class="sub-label">Roster positions</span>
        <div class="roster-preset-row">
          ${ROSTER_PRESETS.map(
            (preset) => `<button type="button" class="chip roster-preset" data-preset="${escapeHtml(preset.label)}">${escapeHtml(preset.label)}</button>`,
          ).join('')}
        </div>
        <div class="roster-pos-grid">
          ${ROSTER_FIELDS.map(
            (field) => `<label>${field.label}
              <input type="number" class="roster-pos-input" data-pos="${field.key}" min="0" max="${field.max}" value="${positions[field.key]}" />
            </label>`,
          ).join('')}
        </div>
        <p class="hint">${escapeHtml(rosterPositionsSummary(positions))} · ${rosterSize} roster spots · suggested ${suggestedRounds} draft rounds</p>
      </div>

      <p class="hint">Yellow lines mark the end of each draft round (every ${cfg.teams} players). Pick badges show expected players at your snake-draft slots.</p>
    </div>`;

  const teamsInput = container.querySelector('#lg-teams') as HTMLInputElement;
  const slotInput = container.querySelector('#lg-slot') as HTMLInputElement;
  const roundsInput = container.querySelector('#lg-rounds') as HTMLInputElement;
  const receptionInput = container.querySelector('#lg-reception') as HTMLInputElement;

  const syncDraft = (): void => {
    const teams = Math.max(8, Math.min(14, Number(teamsInput.value) || 12));
    const slot = Math.max(1, Math.min(teams, Number(slotInput.value) || 1));
    const rounds = Math.max(10, Math.min(24, Number(roundsInput.value) || suggestedRounds));
    teamsInput.value = String(teams);
    slotInput.value = String(slot);
    slotInput.max = String(teams);
    roundsInput.value = String(rounds);
    updateDraftConfig(teams, slot, rounds);
    onChange();
  };

  const syncScoring = (receptionPoints: number): void => {
    setScoringSettings({ receptionPoints: normalizeReceptionPoints(receptionPoints) });
    onChange();
    renderLeagueSettings(container, onChange);
  };

  const syncRoster = (next: RosterPositionSettings, offerRoundUpdate = true): void => {
    const normalized = normalizeRosterPositions(next);
    setRosterPositions(normalized);
    if (offerRoundUpdate) {
      const suggested = suggestedDraftRounds(normalized);
      if (cfg.rounds !== suggested && confirm(`Update draft rounds to ${suggested} to match your ${rosterTotalSize(normalized)}-player roster?`)) {
        updateDraftConfig(cfg.teams, cfg.slot, suggested);
      }
    }
    onChange();
    renderLeagueSettings(container, onChange);
  };

  teamsInput.addEventListener('change', syncDraft);
  slotInput.addEventListener('change', syncDraft);
  roundsInput.addEventListener('change', syncDraft);

  receptionInput.addEventListener('change', () => {
    syncScoring(Number(receptionInput.value));
  });

  container.querySelectorAll('.scoring-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncScoring(Number((btn as HTMLElement).dataset.reception));
    });
  });

  container.querySelectorAll('.roster-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const label = (btn as HTMLElement).dataset.preset;
      const preset = ROSTER_PRESETS.find((p) => p.label === label);
      if (preset) syncRoster({ ...preset.positions });
    });
  });

  container.querySelectorAll('.roster-pos-input').forEach((input) => {
    input.addEventListener('change', () => {
      const next = { ...getActiveLeague().rosterPositions };
      for (const el of container.querySelectorAll('.roster-pos-input')) {
        const key = (el as HTMLElement).dataset.pos as keyof RosterPositionSettings;
        next[key] = Number((el as HTMLInputElement).value);
      }
      syncRoster(next);
    });
  });
}
