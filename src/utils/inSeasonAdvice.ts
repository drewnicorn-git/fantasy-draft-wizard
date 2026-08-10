import type {
  DraftConfig,
  InSeasonData,
  InSeasonDropCandidate,
  InSeasonTarget,
  InjuriesData,
  Player,
  ScoringFormat,
  StartSitAdvice,
  StartSitSlot,
} from '../data/types';
import { DEFAULT_ROSTER_POSITIONS } from '../data/types';
import { countRoster, resolveRosterLimits } from '../sim/bot';
import { getActiveLeague } from '../state/leaguesStore';
import { getBotRosterLimits, type BotRosterLimits } from './leagueSettings';
import { byeWeekConflicts } from './analytics';
import { formatProjDisplay, getProjPts } from './inSeasonStats';
import { escapeHtml } from './escapeHtml';

const INJURY_STATUSES = new Set(['out', 'doubtful', 'injured reserve', 'ir', 'suspension']);
const SKILL = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
const FLEX_ELIGIBLE = new Set(['RB', 'WR', 'TE']);
const SUPERFLEX_ELIGIBLE = new Set(['QB', 'RB', 'WR', 'TE']);

interface ScoredPlayer {
  player: Player;
  proj: number;
  flags: string[];
}

function resolveLimits(config?: DraftConfig): BotRosterLimits {
  if (config?.rosterPositions) return getBotRosterLimits(config.rosterPositions);
  return resolveRosterLimits(config ?? getActiveLeague().draftConfig);
}

function getSeasonPts(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): number {
  const row = inSeason?.players[p.id];
  if (!row) return 0;
  return scoring === 'ppr' ? (row.seasonPtsPpr ?? 0) : (row.seasonPtsStd ?? 0);
}

function formatProjLabel(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): string {
  const row = inSeason?.players[p.id];
  return formatProjDisplay(row, scoring).text;
}

function getProjScore(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): number {
  return getProjPts(inSeason?.players[p.id], scoring) ?? 0;
}

function rosScore(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): number {
  const season = getSeasonPts(p, inSeason, scoring);
  const proj = getProjScore(p, inSeason, scoring);
  return season + proj * 4;
}

function isInjured(p: Player, injuries: InjuriesData | null): boolean {
  const status = (p.injuryStatus ?? '').toLowerCase();
  if (INJURY_STATUSES.has(status)) return true;
  const entry = injuries?.entries.find((e) => e.playerId === p.id);
  if (!entry) return false;
  const s = entry.status.toLowerCase();
  return s.includes('out') || s.includes('doubtful') || s.includes('reserve') || s.includes('suspension');
}

function playerFlags(
  p: Player,
  week: number | null,
  injuries: InjuriesData | null,
): string[] {
  const flags: string[] = [];
  if (week != null && p.bye === week) flags.push('bye');
  if (isInjured(p, injuries)) flags.push('injured');
  return flags;
}

function scoreRosterPlayers(
  roster: Player[],
  inSeason: InSeasonData | null,
  injuries: InjuriesData | null,
  scoring: ScoringFormat,
): ScoredPlayer[] {
  const week = inSeason?.projectionWeek ?? inSeason?.currentWeek ?? null;
  return roster
    .filter((p) => SKILL.has(String(p.pos)))
    .map((p) => ({
      player: p,
      proj: getProjScore(p, inSeason, scoring),
      flags: playerFlags(p, week, injuries),
    }));
}

function takeTop(
  pool: ScoredPlayer[],
  count: number,
  slot: string,
  used: Set<string>,
  starters: StartSitSlot[],
): void {
  const sorted = [...pool].sort((a, b) => b.proj - a.proj);
  let added = 0;
  for (const item of sorted) {
    if (added >= count) break;
    if (used.has(item.player.id)) continue;
    used.add(item.player.id);
    starters.push({ player: item.player, slot, proj: item.proj, flags: item.flags });
    added++;
  }
}

export function buildStartSitAdvice(
  roster: Player[],
  inSeason: InSeasonData | null,
  injuries: InjuriesData | null,
  scoring: ScoringFormat,
  config?: DraftConfig,
): StartSitAdvice {
  const limits = resolveLimits(config);
  const scored = scoreRosterPlayers(roster, inSeason, injuries, scoring);
  const used = new Set<string>();
  const starters: StartSitSlot[] = [];

  const byPos = (pos: string): ScoredPlayer[] => scored.filter((s) => String(s.player.pos) === pos);

  takeTop(byPos('QB'), limits.QB, 'QB', used, starters);
  takeTop(byPos('RB'), limits.RB, 'RB', used, starters);
  takeTop(byPos('WR'), limits.WR, 'WR', used, starters);
  takeTop(byPos('TE'), limits.TE, 'TE', used, starters);

  if (limits.FLEX > 0) {
    const flexPool = scored.filter((s) => !used.has(s.player.id) && FLEX_ELIGIBLE.has(String(s.player.pos)));
    takeTop(flexPool, limits.FLEX, 'FLEX', used, starters);
  }

  if (limits.SUPERFLEX > 0) {
    const sfPool = scored.filter((s) => !used.has(s.player.id) && SUPERFLEX_ELIGIBLE.has(String(s.player.pos)));
    takeTop(sfPool, limits.SUPERFLEX, 'SF', used, starters);
  }

  if (limits.K > 0) takeTop(byPos('K'), limits.K, 'K', used, starters);
  if (limits.DST > 0) takeTop(byPos('DST'), limits.DST, 'DST', used, starters);

  const sit = scored
    .filter((s) => !used.has(s.player.id))
    .sort((a, b) => b.proj - a.proj)
    .map((s) => {
      const reasons: string[] = [];
      if (s.flags.includes('bye')) reasons.push('on bye');
      if (s.flags.includes('injured')) reasons.push('injured');
      if (!reasons.length) reasons.push('lower weekly projection');
      return { player: s.player, proj: s.proj, reason: reasons.join(', ') };
    });

  return {
    projectionWeek: inSeason?.projectionWeek ?? inSeason?.currentWeek ?? null,
    starters,
    sit,
  };
}

function starterNeedPositions(counts: ReturnType<typeof countRoster>, limits: BotRosterLimits): string[] {
  const need: string[] = [];
  if (counts.QB < limits.QB + limits.SUPERFLEX) need.push('QB');
  if (counts.RB < limits.RB) need.push('RB');
  if (counts.WR < limits.WR) need.push('WR');
  if (counts.TE < limits.TE) need.push('TE');
  if (limits.K > 0 && counts.K < limits.K) need.push('K');
  if (limits.DST > 0 && counts.DST < limits.DST) need.push('DST');
  return need;
}

function weakestStarterPos(
  inSeason: InSeasonData | null,
  scoring: ScoringFormat,
  startSit: StartSitAdvice,
): string | null {
  const starters = startSit.starters.map((s) => s.player);
  if (!starters.length) return null;
  const sorted = [...starters].sort((a, b) => getSeasonPts(a, inSeason, scoring) - getSeasonPts(b, inSeason, scoring));
  return String(sorted[0]?.pos ?? null);
}

function waiverCandidates(
  roster: Player[],
  freeAgents: Player[],
  inSeason: InSeasonData | null,
  scoring: ScoringFormat,
  config?: DraftConfig,
  startSit?: StartSitAdvice,
): Array<{ player: Player; score: number; reason: string }> {
  const limits = resolveLimits(config);
  const counts = countRoster(roster);
  const needPositions = starterNeedPositions(counts, limits);
  const weakPos = startSit ? weakestStarterPos(inSeason, scoring, startSit) : null;
  const positions = new Set([...needPositions, ...(weakPos ? [weakPos] : [])]);

  return freeAgents
    .filter((p) => positions.has(String(p.pos)))
    .map((p) => {
      const proj = getProjScore(p, inSeason, scoring);
      const projLabel = formatProjLabel(p, inSeason, scoring);
      const season = getSeasonPts(p, inSeason, scoring);
      const score = proj * 1.4 + season * 0.35;
      const weekLabel = inSeason?.projectionWeek ?? '?';
      const reason =
        needPositions.includes(String(p.pos))
          ? `Fills ${p.pos} need · ${projLabel} proj pts (W${weekLabel})`
          : `Upgrade at ${p.pos} · ${season.toFixed(1)} season pts, ${projLabel} proj`;
      return { player: p, score, reason };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

function byeCandidates(
  roster: Player[],
  freeAgents: Player[],
  inSeason: InSeasonData | null,
  scoring: ScoringFormat,
): Array<{ player: Player; score: number; reason: string }> {
  const week = inSeason?.projectionWeek ?? inSeason?.currentWeek ?? null;
  if (week == null) return [];

  const onBye = roster.filter(
    (p) => p.bye === week && ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(String(p.pos)),
  );
  if (!onBye.length) return [];

  const positions = new Set(onBye.map((p) => String(p.pos)));
  return freeAgents
    .filter((p) => positions.has(String(p.pos)) && p.bye !== week)
    .map((p) => {
      const proj = getProjScore(p, inSeason, scoring);
      const projLabel = formatProjLabel(p, inSeason, scoring);
      return {
        player: p,
        score: proj,
        reason: `Bye fill for week ${week} · ${projLabel} proj pts at ${p.pos}`,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

function injuryCandidates(
  roster: Player[],
  freeAgents: Player[],
  inSeason: InSeasonData | null,
  injuries: InjuriesData | null,
  scoring: ScoringFormat,
): Array<{ player: Player; score: number; reason: string }> {
  const hurt = roster.filter((p) => isInjured(p, injuries));
  if (!hurt.length) return [];

  const results: Array<{ player: Player; score: number; reason: string }> = [];
  for (const injured of hurt) {
    const teamBackups = freeAgents.filter(
      (p) =>
        p.team === injured.team &&
        p.pos === injured.pos &&
        (p.depth === 2 || p.depth === 1) &&
        !isInjured(p, injuries),
    );
    const posBackups = freeAgents.filter(
      (p) => p.pos === injured.pos && !isInjured(p, injuries) && p.id !== injured.id,
    );
    const pool = teamBackups.length ? teamBackups : posBackups;
    for (const p of pool) {
      const proj = getProjScore(p, inSeason, scoring);
      const projLabel = formatProjLabel(p, inSeason, scoring);
      const depthNote = p.depth === 2 ? 'depth backup' : 'same-position fill-in';
      results.push({
        player: p,
        score: proj + (p.team === injured.team ? 2 : 0),
        reason: `Replace ${injured.name} (${injured.injuryStatus ?? 'injured'}) · ${depthNote}, ${projLabel} proj`,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

function suggestDropForAdd(
  add: Player,
  startSit: StartSitAdvice,
  inSeason: InSeasonData | null,
  scoring: ScoringFormat,
): { player: Player; reason: string } | null {
  const sitPlayers = startSit.sit.map((s) => s.player);
  if (!sitPlayers.length) return null;

  const samePos = sitPlayers.filter((p) => p.pos === add.pos);
  const pool = samePos.length ? samePos : sitPlayers;
  const drop = [...pool].sort((a, b) => rosScore(a, inSeason, scoring) - rosScore(b, inSeason, scoring))[0];
  if (!drop) return null;

  const projLabel = formatProjLabel(drop, inSeason, scoring);
  const season = getSeasonPts(drop, inSeason, scoring);
  return {
    player: drop,
    reason: `Drop ${drop.name} · ${projLabel} proj, ${season.toFixed(1)} season pts`,
  };
}

export function getDropCandidates(
  roster: Player[],
  inSeason: InSeasonData | null,
  scoring: ScoringFormat,
  config?: DraftConfig,
  limit = 5,
): InSeasonDropCandidate[] {
  const startSit = buildStartSitAdvice(roster, inSeason, null, scoring, config);
  return startSit.sit
    .map((s) => ({
      player: s.player,
      score: rosScore(s.player, inSeason, scoring),
      reason: `${s.reason} · ${formatProjLabel(s.player, inSeason, scoring)} proj`,
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

export function buildInSeasonAlerts(roster: Player[]): string[] {
  const alerts: string[] = [];
  const byes = byeWeekConflicts(roster);
  if (byes.length) alerts.push(`Bye conflicts (3+ starters): weeks ${byes.join(', ')}`);
  const byeCounts = new Map<number, number>();
  for (const p of roster) {
    if (p.bye == null || !['QB', 'RB', 'WR', 'TE'].includes(String(p.pos))) continue;
    byeCounts.set(p.bye, (byeCounts.get(p.bye) ?? 0) + 1);
  }
  for (const [week, count] of [...byeCounts.entries()].filter(([, n]) => n >= 2)) {
    alerts.push(`Week ${week}: ${count} skill starters on bye`);
  }
  return alerts;
}

export function getInSeasonTargets(
  roster: Player[],
  freeAgents: Player[],
  inSeason: InSeasonData | null,
  injuries: InjuriesData | null,
  scoring: ScoringFormat,
  limit = 6,
  config?: DraftConfig,
): InSeasonTarget[] {
  const startSit = buildStartSitAdvice(roster, inSeason, injuries, scoring, config);
  const picked = new Set<string>();
  const results: InSeasonTarget[] = [];

  const buckets: Array<{ category: InSeasonTarget['category']; items: Array<{ player: Player; score: number; reason: string }> }> =
    [
      { category: 'injury', items: injuryCandidates(roster, freeAgents, inSeason, injuries, scoring) },
      { category: 'bye', items: byeCandidates(roster, freeAgents, inSeason, scoring) },
      {
        category: 'waiver',
        items: waiverCandidates(roster, freeAgents, inSeason, scoring, config, startSit),
      },
    ];

  const perBucket = [2, 2, 2];
  for (let i = 0; i < buckets.length; i++) {
    const { category, items } = buckets[i];
    let added = 0;
    for (const item of items) {
      if (results.length >= limit || added >= perBucket[i]) break;
      if (picked.has(item.player.id)) continue;
      picked.add(item.player.id);
      const drop = suggestDropForAdd(item.player, startSit, inSeason, scoring);
      results.push({
        category,
        player: item.player,
        reason: item.reason,
        dropPlayer: drop?.player,
        dropReason: drop?.reason,
      });
      added++;
    }
  }

  if (results.length < limit) {
    const rest = waiverCandidates(roster, freeAgents, inSeason, scoring, config, startSit).filter(
      (x) => !picked.has(x.player.id),
    );
    for (const item of rest) {
      if (results.length >= limit) break;
      picked.add(item.player.id);
      const drop = suggestDropForAdd(item.player, startSit, inSeason, scoring);
      results.push({
        category: 'waiver',
        player: item.player,
        reason: item.reason,
        dropPlayer: drop?.player,
        dropReason: drop?.reason,
      });
    }
  }

  return results;
}

function renderStartSitPanel(startSit: StartSitAdvice): string {
  const weekLabel = startSit.projectionWeek ?? '?';
  const starterRows = startSit.starters
    .map((s) => {
      const flags = s.flags.length ? ` <span class="inseason-flag">${s.flags.join(', ')}</span>` : '';
      return `<tr>
        <td><span class="inseason-slot-badge">${escapeHtml(s.slot)}</span></td>
        <td><strong>${escapeHtml(s.player.name)}</strong>${flags}</td>
        <td><span class="pos-badge">${escapeHtml(String(s.player.pos))}</span></td>
        <td>${s.proj.toFixed(1)}</td>
      </tr>`;
    })
    .join('');

  const sitRows = startSit.sit
    .slice(0, 8)
    .map(
      (s) => `<tr>
        <td><span class="inseason-slot-badge sit">Sit</span></td>
        <td>${escapeHtml(s.player.name)} <span class="hint">${escapeHtml(s.reason)}</span></td>
        <td><span class="pos-badge">${escapeHtml(String(s.player.pos))}</span></td>
        <td>${s.proj.toFixed(1)}</td>
      </tr>`,
    )
    .join('');

  return `
    <div class="inseason-start-sit-panel">
      <h3>Start / sit (week ${weekLabel} projections)</h3>
      <div class="table-wrap">
        <table class="inseason-lineup-table">
          <thead><tr><th>Slot</th><th>Player</th><th>Pos</th><th>Proj</th></tr></thead>
          <tbody>${starterRows}${sitRows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderDropCandidates(drops: InSeasonDropCandidate[]): string {
  if (!drops.length) return '';
  return `
    <div class="inseason-drop-panel">
      <h4>Drop candidates</h4>
      <ul class="inseason-drop-list">
        ${drops
          .map(
            (d) =>
              `<li><strong>${escapeHtml(d.player.name)}</strong> <span class="pos-badge">${escapeHtml(String(d.player.pos))}</span> — ${escapeHtml(d.reason)}</li>`,
          )
          .join('')}
      </ul>
    </div>`;
}

export function renderInSeasonAdvicePanel(
  container: HTMLElement,
  targets: InSeasonTarget[],
  alerts: string[],
  startSit?: StartSitAdvice,
  dropCandidates?: InSeasonDropCandidate[],
): void {
  const categoryLabel = (c: InSeasonTarget['category']): string => {
    if (c === 'waiver') return 'Waiver';
    if (c === 'bye') return 'Bye stream';
    return 'Injury fill';
  };

  const alertsHtml = alerts.map((a) => `<div class="alert">${escapeHtml(a)}</div>`).join('');
  const targetsHtml = targets.length
    ? `<div class="inseason-target-list">
        ${targets
          .map(
            (t) => `
          <div class="inseason-target-card ${t.category}">
            <span class="inseason-target-badge">${categoryLabel(t.category)}</span>
            <strong>${escapeHtml(t.player.name)}</strong>
            <span class="pos-badge">${escapeHtml(String(t.player.pos))}</span>
            <span class="inseason-target-meta">${escapeHtml(t.player.team)}${t.player.bye != null ? ` · Bye ${t.player.bye}` : ''}</span>
            <p class="hint">${escapeHtml(t.reason)}</p>
            ${
              t.dropPlayer
                ? `<p class="inseason-drop-suggestion">↳ ${escapeHtml(t.dropReason ?? `Consider dropping ${t.dropPlayer.name}`)}</p>`
                : ''
            }
          </div>`,
          )
          .join('')}
      </div>`
    : '<p class="hint">No waiver targets right now. Adjust rosters or refresh in-season data.</p>';

  container.innerHTML = `
    ${startSit ? renderStartSitPanel(startSit) : ''}
    <div class="inseason-advice-panel">
      <h3>Waiver targets</h3>
      ${alertsHtml ? `<div class="draft-alert-list">${alertsHtml}</div>` : ''}
      ${targetsHtml}
      ${dropCandidates ? renderDropCandidates(dropCandidates) : ''}
    </div>`;
}

export function defaultRosterLimits(): BotRosterLimits {
  return getBotRosterLimits(DEFAULT_ROSTER_POSITIONS);
}
