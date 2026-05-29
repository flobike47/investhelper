# Supabase setup

## 1. Créer le projet

1. https://supabase.com/dashboard → **New project** (free tier)
2. Note les valeurs (Project Settings → API) :
   - `Project URL` → `SUPABASE_URL` (et `VITE_SUPABASE_URL`)
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
   - `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY` (BFF uniquement)

## 2. Activer Google OAuth

Authentication → Providers → Google :
1. Active le toggle
2. Crée un OAuth Client sur https://console.cloud.google.com/apis/credentials
   - Type : Web application
   - Authorized redirect URIs : `https://<project-ref>.supabase.co/auth/v1/callback`
3. Colle Client ID + Client Secret dans Supabase

Authentication → URL Configuration :
- **Site URL** : `http://localhost:5173` (dev) / `https://ton-domaine.com` (prod)
- **Redirect URLs** : `http://localhost:5173/**`, `https://ton-domaine.com/**`

## 3. Appliquer le schéma

SQL Editor → coller le contenu de [`migrations/001_initial.sql`](./migrations/001_initial.sql) → Run.

Ou via la Supabase CLI :

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

## 4. Vérifier

Les tables apparaissent dans Database → Tables :
- `user_settings`
- `watchlist`
- `podcast_categories`
- `podcast_episodes`

Chacune a RLS activé (badge "RLS enabled").

## Notes

- Le BFF utilise `service_role` qui bypass RLS. Les policies sont là pour
  la défense en profondeur — au cas où on exposerait demain un client
  Supabase direct depuis le navigateur, RLS empêche un user de lire les
  données d'un autre.
- Tous les `references auth.users(id) on delete cascade` : quand un user
  supprime son compte (depuis Auth → Users), toutes ses données sont
  effacées automatiquement (RGPD-friendly).
