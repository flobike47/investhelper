-- ============================================================================
-- user_settings : taille de position
-- ============================================================================
-- capital_eur        : capital que l'utilisateur consacre à ses positions,
--                      en euros. Null tant qu'il ne l'a pas renseigné (pas de
--                      calcul de taille de position, jamais une valeur
--                      par défaut inventée).
-- risk_per_trade_pct : part du capital risquée par position si le stop est
--                      touché, en % (1 % par défaut, plafonné à 5 %).
--
-- Rétrocompatible : colonne nullable et colonne avec default ; l'ancien BFF
-- les ignore. À appliquer avant de déployer le BFF qui les lit.
-- ============================================================================

alter table public.user_settings
  add column if not exists capital_eur numeric(14, 2)
  check (capital_eur is null or (capital_eur > 0 and capital_eur <= 1000000000));

alter table public.user_settings
  add column if not exists risk_per_trade_pct numeric(4, 2) not null default 1
  check (risk_per_trade_pct > 0 and risk_per_trade_pct <= 5);
