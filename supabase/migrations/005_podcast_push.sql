-- ============================================================================
-- Notifications push : rappel quotidien « ton podcast t'attend »
-- ============================================================================
-- 1. user_settings : l'option (activée ou non), l'heure locale d'envoi et le
--    fuseau de l'utilisateur. podcast_push_last_sent_on sert de verrou
--    « une fois par jour » : le BFF le pose par un UPDATE conditionnel avant
--    d'envoyer, donc deux ticks concurrents ne peuvent pas doubler l'envoi.
-- 2. push_subscriptions : un abonnement Web Push par appareil (iPhone, PC…).
--
-- Rétrocompatible : colonnes avec default, l'ancien BFF les ignore.
-- ============================================================================

alter table public.user_settings
  add column if not exists podcast_push_enabled boolean not null default false;

alter table public.user_settings
  add column if not exists podcast_push_time text not null default '08:00'
  check (podcast_push_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table public.user_settings
  add column if not exists timezone text not null default 'Europe/Paris'
  check (length(timezone) between 1 and 64);

alter table public.user_settings
  add column if not exists podcast_push_last_sent_on date;

-- Le job parcourt seulement les users qui ont activé l'option
create index if not exists user_settings_podcast_push_idx
  on public.user_settings (user_id) where podcast_push_enabled;

-- ----------------------------------------------------------------------------
-- push_subscriptions
-- ----------------------------------------------------------------------------
-- L'endpoint identifie un navigateur sur un appareil : unique. Si un autre
-- compte se connecte sur le même appareil et active les notifications, la
-- ligne lui est réattribuée (upsert côté BFF sur endpoint).
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique check (length(endpoint) between 10 and 2048),
  p256dh      text not null check (length(p256dh) between 1 and 256),
  auth        text not null check (length(auth) between 1 and 64),
  user_agent  text check (length(user_agent) <= 512),
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions read"  on public.push_subscriptions;
drop policy if exists "own push subscriptions write" on public.push_subscriptions;
create policy "own push subscriptions read"
  on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "own push subscriptions write"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
