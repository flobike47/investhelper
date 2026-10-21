-- ============================================================================
-- podcast_shares : un seul partage par épisode
-- ============================================================================
-- Le BFF crée le partage de façon idempotente (lecture puis insert). Sans
-- contrainte, deux POST simultanés créaient deux tokens pour le même épisode.
-- L'index unique fait de la DB la garantie ; le BFF gère le conflit (23505)
-- en renvoyant le partage existant.
-- ============================================================================

-- 1. Dédoublonnage des éventuels doublons existants (on garde le plus ancien)
delete from public.podcast_shares s
using public.podcast_shares older
where s.episode_id = older.episode_id
  and (s.created_at, s.token) > (older.created_at, older.token);

-- 2. L'index non unique de 002 devient redondant
drop index if exists public.podcast_shares_episode_idx;

create unique index if not exists podcast_shares_episode_uniq
  on public.podcast_shares (episode_id);
