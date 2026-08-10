-- Fantasy Draft Wizard: cloud sync for LeaguesStore (run in Supabase SQL editor)

create table if not exists public.user_leagues_store (
  user_id uuid primary key references auth.users (id) on delete cascade,
  store_json jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_leagues_store enable row level security;

-- Table-level grants (required when creating via SQL editor — dashboard-created tables get these automatically)
grant select, insert, update, delete on table public.user_leagues_store to authenticated;

drop policy if exists "Users read own leagues store" on public.user_leagues_store;
drop policy if exists "Users insert own leagues store" on public.user_leagues_store;
drop policy if exists "Users update own leagues store" on public.user_leagues_store;
drop policy if exists "Users manage own leagues store" on public.user_leagues_store;

create policy "Users manage own leagues store"
  on public.user_leagues_store
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional: notification subscriptions (Phase 7 digests)
create table if not exists public.notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  league_id text not null,
  email text,
  slack_webhook_url text,
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly')),
  include_injuries boolean not null default true,
  include_waiver boolean not null default true,
  include_start_sit boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, league_id)
);

alter table public.notification_subscriptions enable row level security;

grant select, insert, update, delete on table public.notification_subscriptions to authenticated;

drop policy if exists "Users manage own notification subscriptions" on public.notification_subscriptions;

create policy "Users manage own notification subscriptions"
  on public.notification_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
