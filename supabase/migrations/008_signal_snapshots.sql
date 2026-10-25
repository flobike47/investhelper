-- ============================================================================
-- signal_snapshots : signaux émis chaque jour, pour mesurer leur performance
-- ============================================================================
-- Le job du BFF (jobs/signalSnapshots.ts) enregistre une fois par jour de
-- bourse, après la clôture américaine, le signal de chaque valeur suivie
-- (watchlists + univers de l'app + repère SPY) pour les trois horizons.
-- /api/signals/track-record en déduit le rendement réel après 1, 3 et 12 mois.
--
-- Table globale, sans donnée personnelle : aucune colonne user_id. RLS
-- activée SANS politique, volontairement : aucun accès par la clé anon ou un
-- JWT utilisateur ; seul le BFF (service_role) lit et écrit.
-- ============================================================================

create table if not exists public.signal_snapshots (
  symbol     text not null check (symbol ~ '^[A-Z0-9.\-]{1,20}$'),
  horizon    text not null check (horizon in ('short', 'medium', 'long')),
  day        date not null,
  price      numeric(18, 6) not null check (price > 0),
  currency   text not null check (currency ~ '^[A-Z]{3}$'),
  score      smallint check (score between -100 and 100),
  signal     text not null check (signal in ('buy', 'hold', 'sell', 'unknown')),
  entry      numeric(18, 6) check (entry is null or entry > 0),
  stop       numeric(18, 6) check (stop is null or stop > 0),
  target     numeric(18, 6) check (target is null or target > 0),
  created_at timestamptz not null default now(),
  primary key (symbol, horizon, day)
);

-- Lecture du suivi : un horizon, parcouru par symbole puis par date
create index if not exists signal_snapshots_horizon_idx
  on public.signal_snapshots (horizon, symbol, day);

alter table public.signal_snapshots enable row level security;
