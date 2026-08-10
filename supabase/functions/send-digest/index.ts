import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  buildInSeasonDigestReport,
  formatDigestHtml,
  formatDigestPlainText,
  formatDigestSlack,
  resolveRosterPlayers,
  type InSeasonData,
  type InjuriesData,
  type Player,
} from '../_shared/digest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

interface SubscriptionRow {
  id: string;
  user_id: string;
  league_id: string;
  email: string | null;
  slack_webhook_url: string | null;
  frequency: 'daily' | 'weekly';
  include_injuries: boolean;
  include_waiver: boolean;
  include_start_sit: boolean;
  enabled: boolean;
  last_sent_at: string | null;
}

interface LeaguesStore {
  leagues: Record<
    string,
    {
      id: string;
      name: string;
      scoring: 'std' | 'ppr';
      inSeason?: {
        active: boolean;
        config: { scoring: 'std' | 'ppr'; rosterPositions?: unknown };
        rosters: Record<number, string[]>;
        myTeamIndex: number;
      } | null;
    }
  >;
}

async function fetchSiteJson<T>(siteUrl: string, path: string): Promise<T> {
  const base = siteUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/${path.replace(/^\//, '')}`, {
    headers: { 'User-Agent': 'fantasy-draft-wizard-digest/1.0' },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return (await res.json()) as T;
}

async function sendResendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('DIGEST_FROM_EMAIL') ?? 'Fantasy Draft Wizard <digests@fantasy-draft-wizard.app>';
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

async function sendSlack(webhookUrl: string, payload: object): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook error ${res.status}: ${body}`);
  }
}

function shouldSendNow(sub: SubscriptionRow, force: boolean): boolean {
  if (force) return true;
  if (!sub.enabled) return false;
  const now = new Date();
  if (sub.frequency === 'weekly' && now.getUTCDay() !== 1) return false;
  if (!sub.last_sent_at) return true;
  const last = Date.parse(sub.last_sent_at);
  const hours = (now.getTime() - last) / 3_600_000;
  return sub.frequency === 'daily' ? hours >= 20 : hours >= 144;
}

async function deliverDigest(
  sub: SubscriptionRow,
  leagueName: string,
  report: ReturnType<typeof buildInSeasonDigestReport>,
): Promise<string[]> {
  const sent: string[] = [];
  const subject = `${leagueName} — Week ${report.weekLabel} fantasy digest`;
  const text = formatDigestPlainText(report);
  const html = formatDigestHtml(report);
  const slack = formatDigestSlack(report);

  if (sub.email) {
    await sendResendEmail(sub.email, subject, html, text);
    sent.push('email');
  }
  if (sub.slack_webhook_url) {
    await sendSlack(sub.slack_webhook_url, slack);
    sent.push('slack');
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET');
    const siteUrl = Deno.env.get('SITE_DATA_URL') ?? 'https://drewnicorn-git.github.io/fantasy-draft-wizard';

    const isCron = cronSecret && req.headers.get('x-cron-secret') === cronSecret;
    const authHeader = req.headers.get('Authorization') ?? '';
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const testMode = !!body.test;
    const targetLeagueId = typeof body.leagueId === 'string' ? body.leagueId : null;

    const admin = createClient(supabaseUrl, serviceKey);

    let userId: string | null = null;
    if (!isCron) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = userData.user.id;
    }

    let query = admin.from('notification_subscriptions').select('*').eq('enabled', true);
    if (userId) query = query.eq('user_id', userId);
    if (targetLeagueId) query = query.eq('league_id', targetLeagueId);

    const { data: subscriptions, error: subError } = await query;
    if (subError) throw subError;

    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ ok: true, message: 'No subscriptions to process', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [rankings, inSeason, injuries] = await Promise.all([
      fetchSiteJson<{ players: Player[] }>(siteUrl, 'rankings.json'),
      fetchSiteJson<InSeasonData>(siteUrl, 'inseason.json'),
      fetchSiteJson<InjuriesData>(siteUrl, 'injuries.json'),
    ]);

    const results: Array<{ leagueId: string; channels: string[]; skipped?: string }> = [];

    for (const sub of subscriptions as SubscriptionRow[]) {
      if (!testMode && !isCron && sub.user_id !== userId) continue;
      if (!shouldSendNow(sub, !!testMode)) {
        results.push({ leagueId: sub.league_id, channels: [], skipped: 'not due' });
        continue;
      }

      const { data: storeRow, error: storeError } = await admin
        .from('user_leagues_store')
        .select('store_json')
        .eq('user_id', sub.user_id)
        .maybeSingle();
      if (storeError) throw storeError;

      const store = storeRow?.store_json as LeaguesStore | undefined;
      const league = store?.leagues?.[sub.league_id];
      if (!league?.inSeason?.active) {
        results.push({ leagueId: sub.league_id, channels: [], skipped: 'no in-season roster' });
        continue;
      }

      const inSeasonState = league.inSeason;
      const rosterIds = inSeasonState.rosters[inSeasonState.myTeamIndex] ?? [];
      const roster = resolveRosterPlayers(rosterIds, rankings.players);
      const owned = new Set(Object.values(inSeasonState.rosters).flat());
      const freeAgents = rankings.players.filter((p) => !owned.has(p.id));

      const report = buildInSeasonDigestReport({
        leagueName: league.name,
        scoring: league.scoring,
        config: inSeasonState.config as { scoring: 'std' | 'ppr'; rosterPositions?: unknown },
        roster,
        freeAgents,
        inSeason,
        injuries,
        options: {
          includeInjuries: sub.include_injuries,
          includeWaiver: sub.include_waiver,
          includeStartSit: sub.include_start_sit,
        },
      });

      if (!sub.email && !sub.slack_webhook_url) {
        results.push({ leagueId: sub.league_id, channels: [], skipped: 'no delivery channel' });
        continue;
      }

      const channels = await deliverDigest(sub, league.name, report);
      if (channels.length && !testMode) {
        await admin
          .from('notification_subscriptions')
          .update({ last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', sub.id);
      }

      results.push({ leagueId: sub.league_id, channels });
    }

    const sentCount = results.filter((r) => r.channels.length).length;
    const message =
      testMode && sentCount
        ? `Test digest sent (${results.flatMap((r) => r.channels).join(', ') || 'none'})`
        : `Processed ${results.length} subscription(s); sent ${sentCount}`;

    return new Response(JSON.stringify({ ok: true, message, sent: sentCount, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Digest send failed';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
