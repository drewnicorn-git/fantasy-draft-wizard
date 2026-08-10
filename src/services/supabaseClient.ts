import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Supabase-js expects the project origin only — not .../rest/v1 from the dashboard API panel. */
export function normalizeSupabaseProjectUrl(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    return url.origin;
  } catch {
    return trimmed.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  }
}

/** Stable redirect for magic links (GitHub Pages subpath via Vite base). */
export function getAuthRedirectUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return new URL(base, window.location.origin).href;
}

export function isSupabaseConfigured(): boolean {
  const url = normalizeSupabaseProjectUrl(import.meta.env.VITE_SUPABASE_URL);
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  return !!url && !!key;
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    const url = normalizeSupabaseProjectUrl(import.meta.env.VITE_SUPABASE_URL);
    client = createClient(url, import.meta.env.VITE_SUPABASE_ANON_KEY!.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
