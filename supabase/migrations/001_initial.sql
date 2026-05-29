-- ============================================================================
-- InvestHelper — schéma initial
-- ============================================================================
-- À exécuter dans le SQL Editor du dashboard Supabase, OU via la Supabase CLI :
--   supabase db push
--
-- Toutes les tables sont scopées à auth.uid() et protégées par RLS. Le BFF
-- utilise la clé service_role (qui bypass RLS) et scope manuellement chaque
-- requête sur user_id. RLS sert de défense en profondeur : si demain on
-- expose un client supabase-js depuis le navigateur, un user ne pourra
-- jamais voir les lignes d'un autre.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- user_settings : préférences UI scalaires
-- ----------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  horizon    text not null default 'medium' check (horizon in ('short', 'medium', 'long')),
  theme      text not null default 'dark' check (theme in ('dark', 'light')),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- watchlist : tickers suivis par utilisateur
-- ----------------------------------------------------------------------------
create table if not exists public.watchlist (
  user_id    uuid not null references auth.users(id) on delete cascade,
  ticker     text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, ticker)
);
create index if not exists watchlist_user_position_idx
  on public.watchlist (user_id, position);

-- ----------------------------------------------------------------------------
-- podcast_categories : thèmes que l'utilisateur veut entendre
-- ----------------------------------------------------------------------------
create table if not exists public.podcast_categories (
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);
create index if not exists podcast_categories_user_position_idx
  on public.podcast_categories (user_id, position);

-- ----------------------------------------------------------------------------
-- podcast_episodes : épisodes générés (script texte + metadata)
-- ----------------------------------------------------------------------------
create table if not exists public.podcast_episodes (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  date                   date not null,
  categories             text[] not null,
  script                 text not null check (length(script) between 1 and 50000),
  sources                text[] not null default '{}',
  duration_estimate_sec  integer not null default 0 check (duration_estimate_sec between 0 and 3600),
  created_at             timestamptz not null default now()
);
create index if not exists podcast_episodes_user_created_idx
  on public.podcast_episodes (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS (deny-by-default ; le BFF en service_role bypass tout ça)
-- ----------------------------------------------------------------------------
alter table public.user_settings        enable row level security;
alter table public.watchlist            enable row level security;
alter table public.podcast_categories   enable row level security;
alter table public.podcast_episodes     enable row level security;

-- Policies (utiles si un jour on appelle Supabase directement depuis le front)
drop policy if exists "own settings read"   on public.user_settings;
drop policy if exists "own settings write"  on public.user_settings;
create policy "own settings read"
  on public.user_settings for select using (auth.uid() = user_id);
create policy "own settings write"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own watchlist read"  on public.watchlist;
drop policy if exists "own watchlist write" on public.watchlist;
create policy "own watchlist read"
  on public.watchlist for select using (auth.uid() = user_id);
create policy "own watchlist write"
  on public.watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own categories read"  on public.podcast_categories;
drop policy if exists "own categories write" on public.podcast_categories;
create policy "own categories read"
  on public.podcast_categories for select using (auth.uid() = user_id);
create policy "own categories write"
  on public.podcast_categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own episodes read"  on public.podcast_episodes;
drop policy if exists "own episodes write" on public.podcast_episodes;
create policy "own episodes read"
  on public.podcast_episodes for select using (auth.uid() = user_id);
create policy "own episodes write"
  on public.podcast_episodes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
