import type {
  DraftConfig,
  InSeasonData,
  InSeasonDropCandidate,
  InSeasonTarget,
  InjuriesData,
  Player,
  ScoringFormat,
  StartSitAdvice,
} from '../data/types';
import {
  buildInSeasonAlerts,
  buildStartSitAdvice,
  getDropCandidates,
  getInSeasonTargets,
} from './inSeasonAdvice';

export interface DigestReportOptions {
  includeInjuries: boolean;
  includeWaiver: boolean;
  includeStartSit: boolean;
}

export interface RosterInjuryNote {
  name: string;
  pos: string;
  status: string;
}

export interface InSeasonDigestReport {
  leagueName: string;
  generatedAt: string;
  weekLabel: string;
  alerts: string[];
  startSit?: StartSitAdvice;
  targets?: InSeasonTarget[];
  drops?: InSeasonDropCandidate[];
  rosterInjuries?: RosterInjuryNote[];
}

export interface DigestReportInput {
  leagueName: string;
  scoring: ScoringFormat;
  config?: DraftConfig;
  roster: Player[];
  freeAgents: Player[];
  inSeason: InSeasonData | null;
  injuries: InjuriesData | null;
  options: DigestReportOptions;
}

const INJURY_STATUSES = new Set(['out', 'doubtful', 'injured reserve', 'ir', 'suspension']);

function rosterInjuryNotes(roster: Player[], injuries: InjuriesData | null): RosterInjuryNote[] {
  const notes: RosterInjuryNote[] = [];
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

export function buildInSeasonDigestReport(input: DigestReportInput): InSeasonDigestReport {
  const { leagueName, scoring, config, roster, freeAgents, inSeason, injuries, options } = input;
  const weekLabel = String(inSeason?.projectionWeek ?? inSeason?.currentWeek ?? '—');
  const alerts = buildInSeasonAlerts(roster);

  const report: InSeasonDigestReport = {
    leagueName,
    generatedAt: new Date().toISOString(),
    weekLabel,
    alerts,
  };

  if (options.includeStartSit) {
    report.startSit = buildStartSitAdvice(roster, inSeason, injuries, scoring, config);
  }

  if (options.includeWaiver) {
    report.targets = getInSeasonTargets(roster, freeAgents, inSeason, injuries, scoring, 6, config);
    report.drops = getDropCandidates(roster, inSeason, scoring, config);
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
    for (const s of report.startSit.sit.slice(0, 6)) {
      lines.push(`  Sit: ${s.player.name} (${s.player.pos}) — ${s.proj.toFixed(1)} proj (${s.reason})`);
    }
    lines.push('');
  }

  if (report.targets?.length) {
    lines.push('Waiver targets', '--------------');
    for (const t of report.targets) {
      lines.push(`• [${categoryLabel(t.category)}] ${t.player.name} (${t.player.pos}) — ${t.reason}`);
      if (t.dropPlayer && t.dropReason) lines.push(`    ↳ ${t.dropReason}`);
    }
    lines.push('');
  }

  if (report.drops?.length) {
    lines.push('Drop candidates', '---------------');
    for (const d of report.drops.slice(0, 5)) {
      lines.push(`• ${d.player.name} (${d.player.pos}) — ${d.reason}`);
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
    `<p>Week ${esc(report.weekLabel)} digest · ${esc(new Date(report.generatedAt).toLocaleString())}</p>`,
  ];

  if (report.alerts.length) {
    sections.push(`<h2>Alerts</h2><ul>${report.alerts.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`);
  }

  if (report.rosterInjuries?.length) {
    sections.push(
      `<h2>Roster injuries</h2><ul>${report.rosterInjuries.map((n) => `<li><strong>${esc(n.name)}</strong> (${esc(n.pos)}) — ${esc(n.status)}</li>`).join('')}</ul>`,
    );
  }

  if (report.startSit) {
    const rows = [
      ...report.startSit.starters.map(
        (s) =>
          `<tr><td>${esc(s.slot)}</td><td>${esc(s.player.name)}</td><td>${esc(String(s.player.pos))}</td><td>${s.proj.toFixed(1)}</td><td>${esc(s.flags.join(', '))}</td></tr>`,
      ),
      ...report.startSit.sit.slice(0, 6).map(
        (s) =>
          `<tr><td>Sit</td><td>${esc(s.player.name)}</td><td>${esc(String(s.player.pos))}</td><td>${s.proj.toFixed(1)}</td><td>${esc(s.reason)}</td></tr>`,
      ),
    ].join('');
    sections.push(
      `<h2>Start / sit</h2><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Slot</th><th>Player</th><th>Pos</th><th>Proj</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  }

  if (report.targets?.length) {
    sections.push(
      `<h2>Waiver targets</h2><ul>${report.targets
        .map((t) => {
          let li = `<li><strong>[${esc(categoryLabel(t.category))}] ${esc(t.player.name)}</strong> (${esc(String(t.player.pos))}) — ${esc(t.reason)}`;
          if (t.dropReason) li += `<br><em>${esc(t.dropReason)}</em>`;
          return `${li}</li>`;
        })
        .join('')}</ul>`,
    );
  }

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;line-height:1.5;color:#111">${sections.join('')}<p style="color:#666;margin-top:2rem">— Fantasy Draft Wizard</p></body></html>`;
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

  if (report.rosterInjuries?.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Roster injuries*\n${report.rosterInjuries.map((n) => `• ${n.name} (${n.pos}) — ${n.status}`).join('\n')}`,
      },
    });
  }

  if (report.startSit) {
    const starterLines = report.startSit.starters
      .map((s) => `• *${s.slot}* ${s.player.name} (${s.player.pos}) — ${s.proj.toFixed(1)} proj${s.flags.length ? ` _${s.flags.join(', ')}_` : ''}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Start / sit*\n${starterLines}` },
    });
  }

  if (report.targets?.length) {
    const targetLines = report.targets
      .map((t) => {
        let line = `• *[${categoryLabel(t.category)}]* ${t.player.name} — ${t.reason}`;
        if (t.dropReason) line += `\n   ↳ ${t.dropReason}`;
        return line;
      })
      .join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Waiver targets*\n${targetLines}` },
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: 'Fantasy Draft Wizard' }],
  });

  return { blocks };
}
