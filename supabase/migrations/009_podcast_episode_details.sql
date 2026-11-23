-- ============================================================================
-- podcast_episodes : détail par source et par sujet
-- ============================================================================
-- Ajoute deux colonnes jsonb NULLABLES à podcast_episodes :
--   source_details : [{ url, title, publisher, category, publishedAt }]
--   topics         : [{ title, summary, category, startRatio }]
-- startRatio ∈ [0, 1] = position du début du sujet dans le script.
--
-- La colonne `sources` (text[]) est GARDÉE telle quelle : anciens épisodes,
-- partages et job de rappel continuent de la lire. NULL = épisode antérieur
-- à cette migration (le BFF renvoie alors null / []).
--
-- RLS : aucune nouvelle policy. Les politiques existantes sur la table
-- couvrent les nouvelles colonnes (filtrage par user_id). Le BFF (service_role)
-- les lit et écrit toujours avec .eq('user_id', ...).
--
-- Idempotente. À appliquer AVANT de déployer le BFF qui les écrit.
-- ============================================================================

alter table public.podcast_episodes
  add column if not exists source_details jsonb,
  add column if not exists topics jsonb;

-- Garde-fou DB : ces colonnes doivent toujours être des tableaux JSON.
do $$
begin
  alter table public.podcast_episodes
    add constraint podcast_episodes_source_details_is_array
    check (source_details is null or jsonb_typeof(source_details) = 'array');
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.podcast_episodes
    add constraint podcast_episodes_topics_is_array
    check (topics is null or jsonb_typeof(topics) = 'array');
exception when duplicate_object then null;
end $$;
