# InvestHelper — consignes pour Claude

Monorepo npm workspaces : `apps/web` (React 19 + Vite + AntD + TanStack Query) et `apps/bff` (Fastify 5 + Redis + Supabase + providers marché/news + Gemini). Schéma SQL dans `supabase/migrations`. Déploiement : images arm64 → Raspberry Pi via Portainer.

## Posture
Agir en dev senior responsable de la stabilité en prod : cause racine plutôt que symptôme, preuve (test, commande, exécution réelle) avant de dire « c'est fait », pas de changement hors du périmètre demandé, signaler les risques repérés en chemin.

## Skills à charger selon la zone touchée
| Zone | Skill |
|---|---|
| Route API, auth, quotas, cache, routes publiques | `bff-endpoint` |
| Appel HTTP sortant, provider, fallback | `external-provider` |
| Gemini (sentiment, thèmes, podcast, TTS) | `gemini-ai` |
| Pages, composants, hooks, appels BFF côté web | `react-frontend` |
| Migrations, RLS, requêtes Supabase | `supabase-db` |
| Indicateurs, scoring, devises | `finance-logic` |
| Écrire / installer des tests | `testing` |
| Bug signalé | `bugfix` |
| Avant commit / push / PR | `ship-check` |
| CI, Docker, compose, Caddy, variables d'env | `deploy-infra` |

## Commandes
- `npm run redis:up` puis `npm run dev` (web :5173, BFF :4000)
- `npm run check` = typecheck + lint + tests + build (même porte que le CI)
- `npm test` · `npm run lint` · `npm run typecheck` · `npm run build`

## Garde-fous
- **Un push sur `main` déploie en production.** Jamais sans accord explicite ; préférer une branche.
- Aucun secret côté web ni dans le code ; aucun appel réel aux API payantes dans les tests.
- Chaque requête Supabase du BFF est scopée par `user_id` (la clé service_role bypass RLS).
- Code et commentaires en français, comme l'existant ; Conventional Commits.
