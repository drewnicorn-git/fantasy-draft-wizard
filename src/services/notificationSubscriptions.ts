import type { NotificationSubscription } from '../data/types';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { formatSupabaseError } from '../utils/supabaseErrors';

const TABLE = 'notification_subscriptions';

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
  updated_at: string | null;
}

function rowToSubscription(row: SubscriptionRow): NotificationSubscription {
  return {
    id: row.id,
    leagueId: row.league_id,
    email: row.email,
    slackWebhookUrl: row.slack_webhook_url,
    frequency: row.frequency,
    includeInjuries: row.include_injuries,
    includeWaiver: row.include_waiver,
    includeStartSit: row.include_start_sit,
    enabled: row.enabled,
    lastSentAt: row.last_sent_at,
    updatedAt: row.updated_at,
  };
}

function subscriptionToRow(sub: NotificationSubscription, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    league_id: sub.leagueId,
    email: sub.email?.trim() || null,
    slack_webhook_url: sub.slackWebhookUrl?.trim() || null,
    frequency: sub.frequency,
    include_injuries: sub.includeInjuries,
    include_waiver: sub.includeWaiver,
    include_start_sit: sub.includeStartSit,
    enabled: sub.enabled,
    updated_at: new Date().toISOString(),
  };
}

export function defaultNotificationSubscription(leagueId: string, email?: string | null): NotificationSubscription {
  return {
    leagueId,
    email: email?.trim() || null,
    slackWebhookUrl: null,
    frequency: 'weekly',
    includeInjuries: true,
    includeWaiver: true,
    includeStartSit: true,
    enabled: true,
  };
}

export async function loadNotificationSubscription(leagueId: string): Promise<NotificationSubscription | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('league_id', leagueId)
    .maybeSingle();

  if (error) throw new Error(formatSupabaseError(error));
  if (!data) return null;
  return rowToSubscription(data as SubscriptionRow);
}

export async function saveNotificationSubscription(sub: NotificationSubscription): Promise<NotificationSubscription> {
  if (!isSupabaseConfigured()) throw new Error('Sign in required to save digest settings');
  const supabase = getSupabase();
  if (!supabase) throw new Error('Cloud sync is not configured');

  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error('Sign in to save digest settings');

  const payload = subscriptionToRow(sub, userId);
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id,league_id' })
    .select('*')
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return rowToSubscription(data as SubscriptionRow);
}

export async function invokeTestDigest(leagueId: string): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured()) throw new Error('Digests require Supabase configuration');
  const supabase = getSupabase();
  if (!supabase) throw new Error('Cloud sync is not configured');

  const { data, error } = await supabase.functions.invoke('send-digest', {
    body: { test: true, leagueId },
  });

  if (error) throw new Error(formatSupabaseError(error));
  const result = data as { ok?: boolean; message?: string; error?: string };
  if (result?.error) throw new Error(result.error);
  return { ok: result?.ok ?? true, message: result?.message ?? 'Test digest sent' };
}

export { isSupabaseConfigured };
