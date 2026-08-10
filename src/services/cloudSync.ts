import type { LeaguesStore } from '../data/types';
import { LEAGUES_STORE_VERSION } from '../state/leaguesStore';
import {
  loadLeaguesStore,
  replaceLeaguesStore,
  resetLeaguesStoreCache,
  saveLeaguesStore,
} from '../state/leaguesStore';
import { sanitizeImportedStore } from '../utils/leagueExport';
import { getAuthRedirectUrl, getSupabase, isSupabaseConfigured } from './supabaseClient';
import { formatSupabaseError } from '../utils/supabaseErrors';

const CLOUD_TABLE = 'user_leagues_store';
const PUSH_DEBOUNCE_MS = 2_000;

export type CloudSyncStatus = 'disabled' | 'signed-out' | 'idle' | 'syncing' | 'synced' | 'error';

let status: CloudSyncStatus = isSupabaseConfigured() ? 'signed-out' : 'disabled';
let statusDetail = '';
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let listeners: Array<() => void> = [];

function setStatus(next: CloudSyncStatus, detail = ''): void {
  status = next;
  statusDetail = detail;
  for (const fn of listeners) fn();
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return status;
}

export function getCloudSyncDetail(): string {
  return statusDetail;
}

export function subscribeCloudSync(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function storeTimestamp(store: LeaguesStore): number {
  if (store.updatedAt) return Date.parse(store.updatedAt) || 0;
  const leagueTimes = Object.values(store.leagues).map((l) => Date.parse(l.updatedAt) || 0);
  return leagueTimes.length ? Math.max(...leagueTimes) : 0;
}

function stampStore(store: LeaguesStore): LeaguesStore {
  return {
    ...store,
    version: LEAGUES_STORE_VERSION,
    updatedAt: new Date().toISOString(),
  };
}

async function getUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function pullRemoteStore(userId: string): Promise<{ store: LeaguesStore; remoteUpdatedAt: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('store_json, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.store_json) return null;

  const store = sanitizeImportedStore(data.store_json as LeaguesStore);
  return { store, remoteUpdatedAt: data.updated_at as string };
}

async function pushRemoteStore(userId: string, store: LeaguesStore): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from(CLOUD_TABLE).upsert(
    {
      user_id: userId,
      store_json: store,
      updated_at: store.updatedAt ?? new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) throw error;
}

/** After sign-in: pull cloud copy if newer, otherwise upload local. */
export async function reconcileCloudStoreOnSignIn(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getUserId();
  if (!userId) {
    setStatus('signed-out');
    return;
  }

  setStatus('syncing', 'Loading your leagues…');
  try {
    const local = loadLeaguesStore();
    const remote = await pullRemoteStore(userId);

    if (!remote) {
      await pushRemoteStore(userId, stampStore(local));
      setStatus('synced', 'Leagues backed up to your account');
      return;
    }

    const localTs = storeTimestamp(local);
    const remoteTs = Date.parse(remote.remoteUpdatedAt) || storeTimestamp(remote.store);

    if (remoteTs > localTs) {
      replaceLeaguesStore(remote.store, { skipCloud: true });
      resetLeaguesStoreCache();
      setStatus('synced', 'Loaded leagues from your account');
    } else if (localTs > remoteTs) {
      await pushRemoteStore(userId, stampStore(local));
      setStatus('synced', 'Uploaded local leagues to your account');
    } else {
      setStatus('synced', 'Already up to date');
    }
  } catch (err) {
    setStatus('error', formatSupabaseError(err));
    throw err;
  }
}

export async function pushCloudStoreNow(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getUserId();
  if (!userId) {
    setStatus('signed-out');
    return;
  }

  setStatus('syncing', 'Saving…');
  try {
    const store = stampStore(loadLeaguesStore());
    saveLeaguesStore(store, { skipCloud: true });
    await pushRemoteStore(userId, store);
    setStatus('synced', 'Saved to your account');
  } catch (err) {
    setStatus('error', formatSupabaseError(err, 'Save failed'));
    throw err;
  }
}

export function scheduleCloudPush(store: LeaguesStore): void {
  if (!isSupabaseConfigured()) return;

  void getUserId().then((userId) => {
    if (!userId) {
      setStatus('signed-out');
      return;
    }

    if (pushTimer) clearTimeout(pushTimer);
    setStatus('idle', 'Pending save…');
    pushTimer = setTimeout(() => {
      pushTimer = null;
      void pushRemoteStore(userId, store).then(
        () => setStatus('synced', 'Saved to your account'),
        (err) => setStatus('error', formatSupabaseError(err, 'Save failed')),
      );
    }, PUSH_DEBOUNCE_MS);
  });
}

export async function initCloudSync(onStoreChanged: () => void): Promise<void> {
  if (!isSupabaseConfigured()) {
    setStatus('disabled');
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      try {
        await reconcileCloudStoreOnSignIn();
        onStoreChanged();
      } catch {
        /* status already set */
      }
    } else {
      setStatus('signed-out');
    }
  });

  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    try {
      await reconcileCloudStoreOnSignIn();
    } catch {
      /* keep local data */
    }
  } else {
    setStatus('signed-out');
  }
}

export async function signInWithEmail(email: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Cloud sync is not configured on this deployment');

  const redirectTo = getAuthRedirectUrl();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signOutCloud(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  setStatus('signed-out');
}

export async function getSignedInEmail(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email ?? null;
}

export { isSupabaseConfigured } from './supabaseClient';
