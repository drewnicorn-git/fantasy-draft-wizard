// Shared digest builder for Supabase Edge Functions (Deno).
// Keep in sync with src/utils/reportBuilder.ts and src/utils/inSeasonAdvice.ts.

export type ScoringFormat = 'std' | 'ppr';

export interface Player {
  id: string;
  name: string;
  team: string;
  pos: string;
  bye?: number | null;
  depth?: number | null;
  injuryStatus?: string | null;
}

export interface RosterPositionSettings {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  SUPERFLEX: number;
  K: number;
  DST: number;
  BENCH: number;
}

export interface DraftConfig {
  teams: number;
  slot: number;
  rounds: number;
  scoring: ScoringFormat;
  rosterPositions?: RosterPositionSettings;
}

export interface InSeasonPlayerValue {
  seasonPtsStd: number | null;
  seasonPtsPpr: number | null;
  prevWeekPtsStd: number | null;
  prevWeekPtsPpr: number | null;
  projPtsStd: number | null;
  projPtsPpr: number | null;
  projIsFallback?: boolean;
  hasStats?: boolean;
}

export interface InSeasonData {
  currentWeek: number;
  projectionWeek: number;
  players: Record<string, InSeasonPlayerValue>;
}

export interface InjuryEntry {
  playerId: string;
  status: string;
}

export interface InjuriesData {
  entries: InjuryEntry[];
}

export interface StartSitSlot {
  player: Player;
  slot: string;
  proj: number;
  flags: string[];
}

export interface StartSitAdvice {
  projectionWeek: number | null;
  starters: StartSitSlot[];
  sit: Array<{ player: Player; proj: number; reason: string }>;
}

export interface InSeasonTarget {
  category: 'waiver' | 'bye' | 'injury';
  player: Player;
  reason: string;
  dropPlayer?: Player;
  dropReason?: string;
}

export interface InSeasonDropCandidate {
  player: Player;
  reason: string;
  score: number;
}

export interface DigestReportOptions {
  includeInjuries: boolean;
  includeWaiver: boolean;
  includeStartSit: boolean;
}

export interface InSeasonDigestReport {
  leagueName: string;
  generatedAt: string;
  weekLabel: string;
  alerts: string[];
  startSit?: StartSitAdvice;
  targets?: InSeasonTarget[];
  drops?: InSeasonDropCandidate[];
  rosterInjuries?: Array<{ name: string; pos: string; status: string }>;
}

const DEFAULT_ROSTER: RosterPositionSettings = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  SUPERFLEX: 0,
  K: 1,
  DST: 1,
  BENCH: 6,
};

const INJURY_STATUSES = new Set(['out', 'doubtful', 'injured reserve', 'ir', 'suspension']);
const SKILL = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
const FLEX_ELIGIBLE = new Set(['RB', 'WR', 'TE']);
const SUPERFLEX_ELIGIBLE = new Set(['QB', 'RB', 'WR', 'TE']);

function limits(config?: DraftConfig): RosterPositionSettings {
  return config?.rosterPositions ?? DEFAULT_ROSTER;
}

function getProjPts(row: InSeasonPlayerValue | undefined, scoring: ScoringFormat): number | null {
  if (!row) return null;
  const value = scoring === 'ppr' ? row.projPtsPpr : row.projPtsStd;
  return value ?? null;
}

function formatProjLabel(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): string {
  const row = inSeason?.players[p.id];
  if (row?.hasStats === false) return 'No stats';
  const value = getProjPts(row, scoring);
  if (value == null) return '—';
  const fallback = row?.projIsFallback ?? false;
  return `${value.toFixed(1)}${fallback ? '*' : ''}`;
}

function getProjScore(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): number {
  return getProjPts(inSeason?.players[p.id], scoring) ?? 0;
}

function getSeasonPts(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): number {
  const row = inSeason?.players[p.id];
  if (!row) return 0;
  return scoring === 'ppr' ? (row.seasonPtsPpr ?? 0) : (row.seasonPtsStd ?? 0);
}

function rosScore(p: Player, inSeason: InSeasonData | null, scoring: ScoringFormat): number {
  return getSeasonPts(p, inSeason, scoring) + getProjScore(p, inSeason, scoring) * 4;
}

function isInjured(p: Player, injuries: InjuriesData | null): boolean {
  const status = (p.injuryStatus ?? '').toLowerCase();
  if (INJURY_STATUSES.has(status)) return true;
  const entry = injuries?.entries.find((e) => e.playerId === p.id);
  if (!entry) return false;
  const s = entry.status.toLowerCase();
  return s.includes('out') || s.includes('doubtful') || s.includes('reserve') || s.includes('suspension');
}

function countRoster(roster: Player[]): Record<string, number> {
  const c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, total: roster.length };
  for (const p of roster) {
    if (p.pos in c) (c as Record<string, number>)[p.pos]++;
  }
  return c;
}

function byeWeekConflicts(roster: Player[]): number[] {
  const byWeek = new Map<number, number>();
  for (const p of roster) {
    if (p.bye == null || !['QB', 'RB', 'WR', 'TE'].includes(String(p.pos))) continue;
    byWeek.set(p.bye, (byWeek.get(p.bye) ?? 0) + 1);
  }
  return [...byWeek.entries()].filter(([, n]) => n >= 3).map(([w]) => w);
}

function buildAlerts(roster: Player[]): string[] {
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

interface ScoredPlayer {
  player: Player;
  proj: number;
  flags: string[];
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
    .map((p) => {
      const flags: string[] = [];
      if (week != null && p.bye === week) flags.push('bye');
      if (isInjured(p, injuries)) flags.push('injured');
      return { player: p, proj: getProjScore(p, inSeason, scoring), flags };
    });
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
  const lim = limits(config);
  const scored = scoreRosterPlayers(roster, inSeason, injuries, scoring);
  const used = new Set<string>();
  const starters: StartSitSlot[] = [];
  const byPos = (pos: string): ScoredPlayer[] => scored.filter((s) => String(s.player.pos) === pos);

  takeTop(byPos('QB'), lim.QB, 'QB', used, starters);
  takeTop(byPos('RB'), lim.RB, 'RB', used, starters);
  takeTop(byPos('WR'), lim.WR, 'WR', used, starters);
  takeTop(byPos('TE'), lim.TE, 'TE', used, starters);
  if (lim.FLEX > 0) {
    takeTop(
      scored.filter((s) => !used.has(s.player.id) && FLEX_ELIGIBLE.has(String(s.player.pos))),
      lim.FLEX,
      'FLEX',
      used,
      starters,
    );
  }
  if (lim.SUPERFLEX > 0) {
    takeTop(
      scored.filter((s) => !used.has(s.player.id) && SUPERFLEX_ELIGIBLE.has(String(s.player.pos))),
      lim.SUPERFLEX,
      'SF',
      used,
      starters,
    );
  }
  if (lim.K > 0) takeTop(byPos('K'), lim.K, 'K', used, starters);
  if (lim.DST > 0) takeTop(byPos('DST'), lim.DST, 'DST', used, starters);

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

function waiverCandidates(
  roster: Player[],
  freeAgents: Player[],
  inSeason: InSeasonData | null,
  scoring: ScoringFormat,
  config?: DraftConfig,
  startSit?: StartSitAdvice,
): Array<{ player: Player; score: number; reason: string }> {
  const lim = limits(config);
  const counts = countRoster(roster);
  const need: string[] = [];
  if (counts.QB < lim.QB + lim.SUPERFLEX) need.push('QB');
  if (counts.RB < lim.RB) need.push('RB');
  if (counts.WR < lim.WR) need.push('WR');
  if (counts.TE < lim.TE) need.push('TE');
  if (lim.K > 0 && counts.K < lim.K) need.push('K');
  if (lim.DST > 0 && counts.DST < lim.DST) need.push('DST');

  let weakPos: string | null = null;
  if (startSit?.starters.length) {
    const sorted = [...startSit.starters.map((s) => s.player)].sort(
      (a, b) => getSeasonPts(a, inSeason, scoring) - getSeasonPts(b, inSeason, scoring),
    );
    weakPos = String(sorted[0]?.pos ?? null);
  }
  const positions = new Set([...need, ...(weakPos ? [weakPos] : [])]);

  return freeAgents
    .filter((p) => positions.has(String(p.pos)))
    .map((p) => {
      const proj = getProjScore(p, inSeason, scoring);
      const projLabel = formatProjLabel(p, inSeason, scoring);
      const season = getSeasonPts(p, inSeason, scoring);
      const score = proj * 1.4 + season * 0.35;
      const weekLabel = inSeason?.projectionWeek ?? '?';
      const reason = need.includes(String(p.pos))
        ? `Fills ${p.pos} need · ${projLabel} proj pts (W${weekLabel})`
        : `Upgrade at ${p.pos} · ${season.toFixed(1)} season pts, ${projLabel} proj`;
      return { player: p, score, reason };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

function rosterInjuryNotes(roster: Player[], injuries: InjuriesData | null) {
  const notes: Array<{ name: string; pos: string; status: string }> = [];
  for (const p of roster) {
    const status = (p.injuryStatus ?? '').trim();
    if (status && INJURY_STATUSES.has(status.toLowerCase())) {
      notes.push({ name: p.name, pos: String(p.pos), status });
      continue;
    }
    const entry = injuries?.entries.find((e) => e.playerId === p.id);
    if (!entry) continue;
    const s = entry.status.toLowerCase();
    if (s.includes('out') || s.includes('doubtful') || s.includes('reserve') || s.includes('suspension')) {
      notes.push({ name: p.name, pos: String(p.pos), status: entry.status });
    }
  }
  return notes;
}

export function buildInSeasonDigestReport(input: {
  leagueName: string;
  scoring: ScoringFormat;
  config?: DraftConfig;
  roster: Player[];
  freeAgents: Player[];
  inSeason: InSeasonData | null;
  injuries: InjuriesData | null;
  options: DigestReportOptions;
}): InSeasonDigestReport {
  const { leagueName, scoring, config, roster, freeAgents, inSeason, injuries, options } = input;
  const report: InSeasonDigestReport = {
    leagueName,
    generatedAt: new Date().toISOString(),
    weekLabel: String(inSeason?.projectionWeek ?? inSeason?.currentWeek ?? '—'),
    alerts: buildAlerts(roster),
  };

  if (options.includeStartSit) {
    report.startSit = buildStartSitAdvice(roster, inSeason, injuries, scoring, config);
  }

  if (options.includeWaiver) {
    const startSit = buildStartSitAdvice(roster, inSeason, injuries, scoring, config);
    const items = waiverCandidates(roster, freeAgents, inSeason, scoring, config, startSit).slice(0, 6);
    report.targets = items.map((item) => ({ category: 'waiver' as const, player: item.player, reason: item.reason }));
    report.drops = startSit.sit
      .map((s) => ({
        player: s.player,
        score: rosScore(s.player, inSeason, scoring),
        reason: `${s.reason} · ${formatProjLabel(s.player, inSeason, scoring)} proj`,
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
  }

  if (options.includeInjuries) {
    report.rosterInjuries = rosterInjuryNotes(roster, injuries);
  }

  return report;
}

function categoryLabel(category: InSeasonTarget['category']): string {
  if (category === 'waiver') return 'Waiver';
  if (category === 'bye') return 'Bye stream';
  return 'Injury fill';
}

export function formatDigestPlainText(report: InSeasonDigestReport): string {
  const lines: string[] = [
    `Fantasy Draft Wizard — ${report.leagueName}`,
    `Week ${report.weekLabel} digest · ${new Date(report.generatedAt).toLocaleString()}`,
    '',
  ];
  if (report.alerts.length) {
    lines.push('Alerts', '------');
    for (const a of report.alerts) lines.push(`• ${a}`);
    lines.push('');
  }
  if (report.rosterInjuries?.length) {
    lines.push('Roster injuries', '----------------');
    for (const n of report.rosterInjuries) lines.push(`• ${n.name} (${n.pos}) — ${n.status}`);
    lines.push('');
  }
  if (report.startSit) {
    lines.push(`Start / sit (week ${report.startSit.projectionWeek ?? report.weekLabel})`, '------------------------');
    for (const s of report.startSit.starters) {
      const flags = s.flags.length ? ` [${s.flags.join(', ')}]` : '';
      lines.push(`  ${s.slot}: ${s.player.name} (${s.player.pos}) — ${s.proj.toFixed(1)} proj${flags}`);
    }
    lines.push('');
  }
  if (report.targets?.length) {
    lines.push('Waiver targets', '--------------');
    for (const t of report.targets) {
      lines.push(`• [${categoryLabel(t.category)}] ${t.player.name} (${t.player.pos}) — ${t.reason}`);
    }
    lines.push('');
  }
  lines.push('— Fantasy Draft Wizard');
  return lines.join('\n');
}

export function formatDigestHtml(report: InSeasonDigestReport): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sections: string[] = [
    `<h1>${esc(report.leagueName)}</h1>`,
    `<p>Week ${esc(report.weekLabel)} digest</p>`,
  ];
  if (report.alerts.length) {
    sections.push(`<h2>Alerts</h2><ul>${report.alerts.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`);
  }
  if (report.startSit) {
    sections.push(
      `<h2>Start / sit</h2><ul>${report.startSit.starters
        .map((s) => `<li>${esc(s.slot)}: ${esc(s.player.name)} — ${s.proj.toFixed(1)} proj</li>`)
        .join('')}</ul>`,
    );
  }
  if (report.targets?.length) {
    sections.push(
      `<h2>Waiver targets</h2><ul>${report.targets.map((t) => `<li>${esc(t.player.name)} — ${esc(t.reason)}</li>`).join('')}</ul>`,
    );
  }
  return `<!DOCTYPE html><html><body style="font-family:sans-serif">${sections.join('')}</body></html>`;
}

export function formatDigestSlack(report: InSeasonDigestReport): object {
  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${report.leagueName} — Week ${report.weekLabel}`, emoji: true },
    },
  ];
  if (report.alerts.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Alerts*\n${report.alerts.map((a) => `• ${a}`).join('\n')}` },
    });
  }
  if (report.startSit) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Start / sit*\n${report.startSit.starters.map((s) => `• *${s.slot}* ${s.player.name} — ${s.proj.toFixed(1)} proj`).join('\n')}`,
      },
    });
  }
  if (report.targets?.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Waiver targets*\n${report.targets.map((t) => `• ${t.player.name} — ${t.reason}`).join('\n')}`,
      },
    });
  }
  return { blocks };
}

export function resolveRosterPlayers(ids: string[], allPlayers: Player[]): Player[] {
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Player => !!p);
}
