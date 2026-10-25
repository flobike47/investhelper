---
name: testing
description: Écrire, organiser ou mettre en place les tests d'InvestHelper (Vitest pour web et BFF, fastify.inject pour les routes, Testing Library pour React, mocks réseau). À utiliser quand on ajoute une fonctionnalité, corrige un bug, ou quand l'outillage de test n'existe pas encore.
---

# Tests — stratégie et outillage

## En place
- BFF : `apps/bff/test/*.test.ts`. `test/helpers.ts` fournit un faux Supabase en mémoire qui **applique réellement** les `.eq()` (un oubli de filtre `user_id` fait échouer les tests d'isolation) et des tokens de test (`auth('token-a')`). Redis : `vi.mock('ioredis', …)` vers `ioredis-mock` (voir `share.routes.test.ts`). Gemini : mocké via `vi.mock('../src/providers/gemini.js')`.
- Web : tests à côté du code (`src/**/*.test.ts`), jsdom par défaut ; `// @vitest-environment node` pour un module sans DOM.
- `npm test` (racine) lance tout ; les tests BFF sont typecheckés par `npm run typecheck`.

## Référence de mise en place
- Racine : script `"test": "npm run test --workspaces --if-present"`.
- `apps/bff` : `vitest` ; script `"test": "vitest run"`, `"test:watch": "vitest"`. Config `vitest.config.ts` avec `environment: 'node'`.
  - Pour tester les routes sans démarrer le serveur : `buildServer()` + `app.inject()`. `config.ts` exige `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` → fournir des valeurs factices via `test.env` dans la config Vitest.
  - Redis : `ioredis-mock` via `vi.mock('../src/cache.js')` ou un Redis réel en service CI. Supabase : mocker `providers/supabaseAdmin.js` ; pour les tests d'intégration DB, `supabase start` local.
  - HTTP sortant : `nock` ou `msw/node` avec fixtures JSON dans `test/fixtures/<provider>/`. `nock.disableNetConnect()` : aucun test ne doit toucher Internet ni une API payante.
- `apps/web` : `vitest` + `jsdom` + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`. Réutiliser `vite.config.ts` (alias `@/`). `msw` pour simuler le BFF.
- Couverture : `@vitest/coverage-v8`. Viser des seuils sur `lib/` et `apps/bff/src` (≥ 80 % lignes), pas un chiffre global vanité.

## Quoi tester, par priorité
1. **Logique pure à fort impact** : `apps/bff/src/finance/*` (indicateurs, scoring, analogue, plan de risque, devises ; tests dans `apps/bff/test/finance/`, séries synthétiques dans `testSeries.ts`), `audio.ts` (`splitDialogue`, `pcmToWavBlob`, `processWithConcurrency`), `bff/validation.ts`, `autoDurationMinutes`. Rapide, déterministe, rentable.
2. **Routes BFF** (`app.inject`) : nominal, 401, 400, isolation entre users, 404 ressource d'un autre user, 429 quota, provider en panne → erreur propre, Redis down → passthrough.
3. **Hooks/composants** critiques : mutations optimistes (rollback sur erreur), états chargement/erreur/vide, `RequireAuth`.
4. **E2E** (Playwright) sur 2-3 parcours seulement une fois le reste en place : login mocké → watchlist → podcast.

## Règles d'écriture
- Un test = un comportement, nommé en français par le comportement attendu (`'renvoie 404 quand l'épisode appartient à un autre user'`).
- Arrange / Act / Assert visibles. Pas de logique (boucles, if) dans le corps d'un test : `it.each` pour les tables.
- Tester le comportement observable (réponse HTTP, DOM rendu, valeur retournée), pas les détails d'implémentation.
- Testing Library : requêtes par rôle/label (`getByRole('button', { name: /écouter/i })`), jamais par classe CSS.
- Temps : `vi.useFakeTimers()` + `vi.setSystemTime()` pour tout ce qui dépend de la date (clés de cache journalières, expiration de partage).
- Aléatoire : injecter ou mocker (`crypto.randomBytes`) pour rendre déterministe.
- Pas de `sleep` / timeouts arbitraires ; `await findBy*` / `vi.waitFor`.
- Chaque bug corrigé ⇒ un test de régression qui échoue **avant** le fix (voir skill `bugfix`).

## Vérification
Un test qui n'a jamais échoué n'a rien prouvé : pour un nouveau test, casser temporairement le code ciblé et vérifier qu'il échoue, puis restaurer.
