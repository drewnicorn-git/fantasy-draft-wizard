import type { CustomScoringRules, RosterPositionSettings } from '../data/types';
import { state, setScoringSettings, setRosterPositions, updateDraftConfig } from '../state/appState';
import { getActiveLeague } from '../state/leaguesStore';
import { rulesMatch, SCORING_RULE_FIELDS } from '../utils/fantasyPoints';
import {
  normalizeCustomScoringRules,
  normalizeRosterPositions,
  rosterPositionsSummary,
  rosterTotalSize,
  draftPicksPerTeam,
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

function presetActive(rules: CustomScoringRules, presetRules: CustomScoringRules): boolean {
  return rulesMatch(rules, presetRules);
}

export function renderLeagueSettings(container: HTMLElement, onChange: () => void): void {
  const cfg = state.draftConfig;
  const league = getActiveLeague();
  const rules = league.scoringSettings;
  const positions = league.rosterPositions;
  const scoringLabel = scoringSettingsLabel(rules);
  const keepersPerTeam = cfg.keepersPerTeam ?? 0;
  const rosterSize = rosterTotalSize(positions);
  const draftPicks = draftPicksPerTeam(positions, keepersPerTeam);
  const suggested = suggestedDraftRounds(positions, keepersPerTeam);

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
        <label>Keepers / team
          <input type="number" id="lg-keepers" min="0" max="10" value="${keepersPerTeam}" title="Keepers each team retains before the draft (0 = no limit)" />
        </label>
        <label>Rounds
          <input type="number" id="lg-rounds" min="10" max="24" value="${cfg.rounds}" />
        </label>
      </div>

      <div class="league-rules-section">
        <span class="sub-label">Scoring presets</span>
        <div class="scoring-preset-row" role="group" aria-label="Scoring preset">
          ${SCORING_PRESETS.map(
            (preset) =>
              `<button type="button" class="chip scoring-preset${presetActive(rules, preset.settings) ? ' active' : ''}" data-preset="${escapeHtml(preset.label)}">${escapeHtml(preset.label)}</button>`,
          ).join('')}
        </div>
        <details class="scoring-rules-details">
          <summary>Custom scoring rules</summary>
          <div class="scoring-rules-grid">
            ${SCORING_RULE_FIELDS.map(
              (field) => `<label>${field.label}
                <input type="number" class="scoring-rule-input" data-rule="${field.key}" step="${field.step}" value="${rules[field.key]}" />
              </label>`,
            ).join('')}
          </div>
          <button type="button" id="save-scoring-rules" class="btn secondary btn-xs">Apply scoring rules</button>
        </details>
        <p class="hint">Projected points use Sleeper season stats with your rules. Current: ${escapeHtml(scoringLabel)}.</p>
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
        <p class="hint">${escapeHtml(rosterPositionsSummary(positions))} · ${rosterSize} roster spots${keepersPerTeam ? ` · ${keepersPerTeam} keepers` : ''} · ${draftPicks} draft picks · suggested ${suggested} rounds</p>
      </div>

      <p class="hint">Yellow lines mark the end of each draft round (every ${cfg.teams} players). Pick badges show expected players at your snake-draft slots.</p>
    </div>`;

  const teamsInput = container.querySelector('#lg-teams') as HTMLInputElement;
  const slotInput = container.querySelector('#lg-slot') as HTMLInputElement;
  const keepersInput = container.querySelector('#lg-keepers') as HTMLInputElement;
  const roundsInput = container.querySelector('#lg-rounds') as HTMLInputElement;

  const syncDraft = (): void => {
    const teams = Math.max(8, Math.min(14, Number(teamsInput.value) || 12));
    const slot = Math.max(1, Math.min(teams, Number(slotInput.value) || 1));
    const keepers = Math.max(0, Math.min(10, Number(keepersInput.value) || 0));
    const positionsNow = getActiveLeague().rosterPositions;
    const suggestedNow = suggestedDraftRounds(positionsNow, keepers);
    const rounds = Math.max(10, Math.min(24, Number(roundsInput.value) || suggestedNow));
    teamsInput.value = String(teams);
    slotInput.value = String(slot);
    slotInput.max = String(teams);
    keepersInput.value = String(keepers);
    roundsInput.value = String(rounds);
    updateDraftConfig(teams, slot, rounds, keepers);
    onChange();
  };

  const applyScoringRules = (next: CustomScoringRules): void => {
    setScoringSettings(normalizeCustomScoringRules(next));
    onChange();
    renderLeagueSettings(container, onChange);
  };

  const syncRoster = (next: RosterPositionSettings, offerRoundUpdate = true): void => {
    const normalized = normalizeRosterPositions(next);
    setRosterPositions(normalized);
    if (offerRoundUpdate) {
      const keepers = cfg.keepersPerTeam ?? 0;
      const suggestedRounds = suggestedDraftRounds(normalized, keepers);
      const draftPicks = draftPicksPerTeam(normalized, keepers);
      if (
        cfg.rounds !== suggestedRounds &&
        confirm(
          `Update draft rounds to ${suggestedRounds} to match your ${draftPicks} draft picks (${rosterTotalSize(normalized)} roster${keepers ? ` − ${keepers} keepers` : ''})?`,
        )
      ) {
        updateDraftConfig(cfg.teams, cfg.slot, suggestedRounds, keepers);
      }
    }
    onChange();
    renderLeagueSettings(container, onChange);
  };

  teamsInput.addEventListener('change', syncDraft);
  slotInput.addEventListener('change', syncDraft);
  keepersInput.addEventListener('change', () => {
    const keepers = Math.max(0, Math.min(10, Number(keepersInput.value) || 0));
    keepersInput.value = String(keepers);
    const positionsNow = getActiveLeague().rosterPositions;
    const suggestedRounds = suggestedDraftRounds(positionsNow, keepers);
    const draftPicks = draftPicksPerTeam(positionsNow, keepers);
    if (
      cfg.rounds !== suggestedRounds &&
      confirm(
        `Update draft rounds to ${suggestedRounds} for ${draftPicks} draft picks (${rosterTotalSize(positionsNow)} roster${keepers ? ` − ${keepers} keepers` : ''})?`,
      )
    ) {
      roundsInput.value = String(suggestedRounds);
    }
    syncDraft();
  });
  roundsInput.addEventListener('change', syncDraft);

  container.querySelectorAll('.scoring-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const label = (btn as HTMLElement).dataset.preset;
      const preset = SCORING_PRESETS.find((p) => p.label === label);
      if (!preset) return;
      applyScoringRules(preset.settings);
    });
  });

  container.querySelector('#save-scoring-rules')?.addEventListener('click', () => {
    const next = { ...rules };
    for (const input of container.querySelectorAll('.scoring-rule-input')) {
      const key = (input as HTMLElement).dataset.rule as keyof CustomScoringRules;
      next[key] = Number((input as HTMLInputElement).value);
    }
    applyScoringRules(next);
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
