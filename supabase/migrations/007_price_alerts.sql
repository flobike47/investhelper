-- ============================================================================
-- price_alerts : alertes de prix (seuil libre, stop, objectif) par push
-- ============================================================================
-- Une alerte est à usage unique : le job du BFF (jobs/priceAlerts.ts) la
-- réserve en posant triggered_at par un UPDATE conditionnel (… where
-- triggered_at is null) avant d'envoyer la notification, donc deux passages
-- concurrents ne peuvent pas l'envoyer deux fois.
--
-- threshold est exprimé dans la devise de cotation (currency), celle du cours
-- comparé par le job.
--
-- Limite : 50 alertes actives par utilisateur, garantie par un trigger
-- (verrou consultatif par utilisateur : deux insertions simultanées ne
-- peuvent pas dépasser la limite). Le BFF convertit l'erreur en 409.
-- ============================================================================

create table if not exists public.price_alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  symbol          text not null check (symbol ~ '^[A-Z0-9.\-]{1,20}$'),
  direction       text not null check (direction in ('above', 'below')),
  threshold       numeric(18, 6) not null check (threshold > 0),
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  kind            text not null default 'price' check (kind in ('price', 'stop', 'target')),
  created_at      timestamptz not null default now(),
  triggered_at    timestamptz,
  triggered_price numeric(18, 6) check (triggered_price is null or triggered_price > 0)
);

-- Le job lit les alertes actives, regroupées par symbole
create index if not exists price_alerts_active_idx
  on public.price_alerts (symbol) where triggered_at is null;
-- La fiche liste les alertes d'un utilisateur, les plus récentes d'abord
create index if not exists price_alerts_user_idx
  on public.price_alerts (user_id, created_at desc);

alter table public.price_alerts enable row level security;

drop policy if exists "own price alerts read"  on public.price_alerts;
drop policy if exists "own price alerts write" on public.price_alerts;
create policy "own price alerts read"
  on public.price_alerts for select using (auth.uid() = user_id);
create policy "own price alerts write"
  on public.price_alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.price_alerts_enforce_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Sérialise les insertions d'un même utilisateur pendant la transaction
  perform pg_advisory_xact_lock(hashtext('price_alerts:' || new.user_id::text));
  if (
    select count(*) from public.price_alerts
    where user_id = new.user_id and triggered_at is null
  ) >= 50 then
    raise exception 'price_alerts_limit' using
      errcode = 'P0001',
      detail = 'Limite de 50 alertes actives atteinte';
  end if;
  return new;
end $$;

drop trigger if exists price_alerts_limit on public.price_alerts;
create trigger price_alerts_limit
  before insert on public.price_alerts
  for each row execute function public.price_alerts_enforce_limit();
