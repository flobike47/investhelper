---
name: supabase-db
description: Modifier le schéma ou les requêtes base de données d'InvestHelper (supabase/migrations/*.sql, requêtes supabaseAdmin dans le BFF). À utiliser pour toute nouvelle table/colonne/index/contrainte, politique RLS, fonction SQL, ou requête Supabase côté BFF.
---

# Base de données Supabase (Postgres)

## Modèle de sécurité
- Le BFF utilise `service_role` → **RLS est contournée**. La vraie barrière est le `.eq('user_id', user.id)` dans chaque requête BFF. RLS reste obligatoire en défense en profondeur sur **chaque** table (`enable row level security` + policies `auth.uid() = user_id`).
- Une table sans `user_id` (ex. données partagées) doit avoir une policy explicite et justifiée en commentaire.

## Migrations
- Une migration = un fichier numéroté `NNN_description.sql`, **jamais modifier une migration déjà appliquée** en prod : on en ajoute une nouvelle.
- Idempotentes (`if not exists`, `drop ... if exists` avant `create policy`, `add column if not exists`) — le projet les applique à la main dans le SQL Editor.
- Changements rétrocompatibles, en deux temps si nécessaire (expand → déployer le code → contract). Le BFF et la DB ne sont pas déployés atomiquement : une colonne `not null` sans `default` casse l'ancien code encore en ligne.
- Contraintes dans la DB, pas seulement dans le code : `check` (longueurs, enums), `not null`, FK `on delete cascade`, `unique`. Le BFF valide pour l'UX, la DB garantit l'invariant.
- Toute colonne filtrée/triée dans une requête fréquente a un index (`user_id, created_at desc`…).
- Fonctions SQL : `security invoker` par défaut ; si `security definer`, alors `set search_path = ''` et noms qualifiés.
- Après création, vérifier avec les advisors Supabase (sécurité + perf) si disponibles.

## Requêtes depuis le BFF
- Toujours vérifier `error` après chaque appel Supabase — un `const { data } = await ...` sans lire `error` masque une panne en « pas de données » (cas actuel dans `share.ts` pour la vérif d'ownership).
- `.maybeSingle()` quand 0 ou 1 ligne attendue, `.single()` seulement si l'absence est une erreur.
- Sélectionner les colonnes explicitement, jamais `select('*')` dans une réponse API.
- **Atomicité** : « compter puis insérer » ou « lire max(position) puis insérer » est une race condition. Solutions :
  - limite par user → contrainte via trigger, ou fonction SQL `insert ... where (select count(*) ...) < N` appelée en RPC ;
  - position → `coalesce(max(position), -1) + 1` calculé dans la même instruction SQL (RPC) ;
  - « créer si absent » (ex. partage) → `unique(episode_id)` + `insert ... on conflict do nothing returning`, puis select.
- Mapper les codes Postgres vers des statuts HTTP : `23505` unique → 409, `23503` FK → 404/400, `23514` check → 400, `22P02` format invalide → 400.

## Types
Générer les types TypeScript depuis le schéma (`supabase gen types typescript`) et typer `supabaseAdmin` avec (`createClient<Database>`) : une colonne renommée devient une erreur de compilation au lieu d'un `undefined` en prod.

## Tests
Les règles RLS et contraintes se testent sur une DB locale (`supabase start`) : insertion hors bornes rejetée, user B ne lit pas les lignes de user A via la clé anon, cascade à la suppression d'un user/épisode.
