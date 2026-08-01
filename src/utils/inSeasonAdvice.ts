import type { InSeasonData, InSeasonTarget, InjuriesData, Player, ScoringFormat } from '../data/types';
import { countRoster, ROSTER_LIMITS } from '../sim/bot';
import { byeWeekConflicts } from './analytics';

const INJURY_STATUSES = new Set(['out', 'doubtful', 'injured reserve', 'ir', 'suspension']);
const SKILL = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getSeasonPts(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): number {
  const row = inSeason?.players[p.id];
  if (!row) return 0;
  return scoring === 'ppr' ? (row.seasonPtsPpr ?? 0) : (row.seasonPtsStd ?? 0);
}

function getWeekProj(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): number {
  const row = inSeason?.players[p.id];
  if (!row) return 0;
  return scoring === 'ppr' ? (row.weekProjPpr ?? 0) : (row.weekProjStd ?? 0);
}

function isInjured(p: Player, injuries: InjuriesData | null): boolean {
  const status = (p.injuryStatus ?? '').toLowerCase();
  if (INJURY_STATUSES.has(status)) return true;
  const entry = injuries?.entries.find((e) => e.playerId === p.id);
  if (!entry) return false;
  const s = entry.status.toLowerCase();
  return s.includes('out') || s.includes('doubtful') || s.includes('reserve') || s.includes('suspension');
}

function starterNeedPositions(counts: ReturnType<typeof countRoster>): string[] {
  const need: string[] = [];
  if (counts.QB < ROSTER_LIMITS.QB) need.push('QB');
  if (counts.RB < ROSTER_LIMITS.RB) need.push('RB');
  if (counts.WR < ROSTER_LIMITS.WR) need.push('WR');
  if (counts.TE < ROSTER_LIMITS.TE) need.push('TE');
  if (counts.K < ROSTER_LIMITS.K) need.push('K');
  if (counts.DST < ROSTER_LIMITS.DST) need.push('DST');
  return need;
}

function weakestStarterPos(roster: Player[], inSeason: InSeasonData | null, scoring: ScoringFormat): string | null {
  const starters = roster.filter((p) => SKILL.has(String(p.pos)));
  if (!starters.length) return null;
  const sorted = [...starters].sort((a, b) => getSeasonPts(a, inSeason, scoring) - getSeasonPts(b, inSeason, scoring));
  return String(sorted[0]?.pos ?? null);
}

function waiverCandidates(
  roster: Player[],
  freeAgents: Player[],
  inSeason: InSeasonData | null,
  scoring: ScoringFormat,
): Array<{ player: Player; score: number; reason: string }> {
  const counts = countRoster(roster);
  const needPositions = starterNeedPositions(counts);
  const weakPos = weakestStarterPos(roster, inSeason, scoring);
  const positions = new Set([...needPositions, ...(weakPos ? [weakPos] : [])]);

  return freeAgents
    .filter((p) => positions.has(String(p.pos)))
    .map((p) => {
      const proj = getWeekProj(p, inSeason, scoring);
      const season = getSeasonPts(p, inSeason, scoring);
      const score = proj * 1.4 + season * 0.35;
      const reason =
        needPositions.includes(String(p.pos))
          ? `Fills ${p.pos} need · ${proj.toFixed(1)} proj pts (W${inSeason?.projectionWeek ?? '?'})`
          : `Upgrade at ${p.pos} · ${season.toFixed(1)} season pts, ${proj.toFixed(1)} proj`;
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
      const proj = getWeekProj(p, inSeason, scoring);
      return {
        player: p,
        score: proj,
        reason: `Bye fill for week ${week} · ${proj.toFixed(1)} proj pts at ${p.pos}`,
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
      const proj = getWeekProj(p, inSeason, scoring);
      const depthNote = p.depth === 2 ? 'depth backup' : 'same-position fill-in';
      results.push({
        player: p,
        score: proj + (p.team === injured.team ? 2 : 0),
        reason: `Replace ${injured.name} (${injured.injuryStatus ?? 'injured'}) · ${depthNote}, ${proj.toFixed(1)} proj`,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
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
): InSeasonTarget[] {
  const picked = new Set<string>();
  const results: InSeasonTarget[] = [];

  const buckets: Array<{ category: InSeasonTarget['category']; items: Array<{ player: Player; score: number; reason: string }> }> =
    [
      { category: 'injury', items: injuryCandidates(roster, freeAgents, inSeason, injuries, scoring) },
      { category: 'bye', items: byeCandidates(roster, freeAgents, inSeason, scoring) },
      { category: 'waiver', items: waiverCandidates(roster, freeAgents, inSeason, scoring) },
    ];

  const perBucket = [2, 2, 2];
  for (let i = 0; i < buckets.length; i++) {
    const { category, items } = buckets[i];
    let added = 0;
    for (const item of items) {
      if (results.length >= limit || added >= perBucket[i]) break;
      if (picked.has(item.player.id)) continue;
      picked.add(item.player.id);
      results.push({ category, player: item.player, reason: item.reason });
      added++;
    }
  }

  if (results.length < limit) {
    const rest = waiverCandidates(roster, freeAgents, inSeason, scoring).filter((x) => !picked.has(x.player.id));
    for (const item of rest) {
      if (results.length >= limit) break;
      picked.add(item.player.id);
      results.push({ category: 'waiver', player: item.player, reason: item.reason });
    }
  }

  return results;
}

export function renderInSeasonAdvicePanel(container: HTMLElement, targets: InSeasonTarget[], alerts: string[]): void {
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
          </div>`,
          )
          .join('')}
      </div>`
    : '<p class="hint">No waiver targets right now. Adjust rosters or refresh in-season data.</p>';

  container.innerHTML = `
    <div class="inseason-advice-panel">
      <h3>Waiver targets</h3>
      ${alertsHtml ? `<div class="draft-alert-list">${alertsHtml}</div>` : ''}
      ${targetsHtml}
    </div>`;
}
