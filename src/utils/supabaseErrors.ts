import type { PostgrestError } from '@supabase/supabase-js';

export function formatSupabaseError(err: unknown, fallback = 'Sync failed'): string {
  if (!err || typeof err !== 'object') {
    return err instanceof Error ? err.message : fallback;
  }

  const e = err as PostgrestError & { status?: number };
  const message = e.message?.trim();
  const code = e.code?.trim();
  const details = typeof e.details === 'string' ? e.details.trim() : '';
  const hint = typeof e.hint === 'string' ? e.hint.trim() : '';

  if (code === 'PGRST205' || /could not find the table/i.test(message ?? '')) {
    return 'Cloud sync table missing — run supabase/schema.sql in the Supabase SQL editor, then try Sync now.';
  }
  if (code === '42P01' || /relation .* does not exist/i.test(message ?? '')) {
    return 'Cloud sync table missing — run supabase/schema.sql in the Supabase SQL editor.';
  }
  if (code === '42501' || /row-level security/i.test(message ?? '')) {
    return 'Database permission blocked sync — run supabase/schema.sql again (GRANT + RLS policies), then Sync now.';
  }
  if (/permission denied for table/i.test(message ?? '')) {
    return 'Database permission denied — run supabase/schema.sql again to grant authenticated access.';
  }

  const parts = [message, details, hint, code ? `[${code}]` : ''].filter(Boolean);
  return parts.join(' — ') || fallback;
}
