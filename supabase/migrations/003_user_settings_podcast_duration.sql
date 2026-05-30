-- ============================================================================
-- user_settings.podcast_duration : durée souhaitée pour le podcast
-- ============================================================================
-- Valeurs : 'auto' (par défaut, calculée selon le volume des news du jour)
-- ou '2' / '4' / '8' minutes (cap dur à 10 min côté BFF).
-- ============================================================================

alter table public.user_settings
  add column if not exists podcast_duration text not null default 'auto'
  check (podcast_duration in ('auto', '2', '4', '8'));
