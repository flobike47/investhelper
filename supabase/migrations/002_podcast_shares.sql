-- ============================================================================
-- Podcast shares — liens "non listés" pour qu'un user partage un épisode
-- ============================================================================
-- Le token est une chaîne aléatoire ~16 chars base62 (entropie ~95 bits).
-- L'épisode reste privé : seul quelqu'un avec le token exact peut le lire.
-- Owner peut révoquer (DELETE row) à tout moment.
-- ============================================================================

create table if not exists public.podcast_shares (
  token       text primary key check (length(token) between 8 and 64),
  episode_id  uuid not null references public.podcast_episodes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz                                   -- NULL = pas d'expiration
);

-- Lookup rapide par épisode (le owner consulte "est-ce que cet épisode a un share ?")
create index if not exists podcast_shares_episode_idx
  on public.podcast_shares (episode_id);

-- Lookup rapide par user (lister tous mes partages)
create index if not exists podcast_shares_user_idx
  on public.podcast_shares (user_id, created_at desc);

alter table public.podcast_shares enable row level security;

-- Policies (utiles si on expose Supabase direct depuis le front un jour)
drop policy if exists "own shares read"  on public.podcast_shares;
drop policy if exists "own shares write" on public.podcast_shares;
create policy "own shares read"
  on public.podcast_shares for select using (auth.uid() = user_id);
create policy "own shares write"
  on public.podcast_shares for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ⚠️ L'endpoint /public/podcast/:token côté BFF utilise le service_role
-- (bypass RLS) car le visiteur n'a pas de session Supabase — sécurité par
-- le token qui est non-devinable.
