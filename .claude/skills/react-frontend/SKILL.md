---
name: react-frontend
description: Développer ou relire le frontend InvestHelper (apps/web — React 19, Vite, Ant Design 5, TanStack Query v5, Zustand, React Router 7, supabase-js). À utiliser pour toute page, composant, hook de données, mutation, gestion d'auth côté client ou appel au BFF.
---

# Frontend — standard de qualité

## Architecture
- `services/api.ts` est **le seul** endroit qui parle au BFF. Aucun `axios`/`fetch` dans les composants.
- `hooks/use*.ts` encapsulent TanStack Query ; les pages consomment les hooks, jamais `api.*` directement.
- `lib/` = logique pure (scoring, indicateurs, audio, devises) : **aucun import React**, testable unitairement.
- État serveur → TanStack Query. État UI local → `useState`. Préférences locales persistées → Zustand (`store/`). Ne pas dupliquer une donnée serveur dans Zustand.

## TanStack Query v5
- **Query keys centralisées** dans une factory (`queryKeys.quote(symbol)`, etc.) : aujourd'hui `['quote', s]` est écrit à plusieurs endroits (`useQuote` et `useAnalyzedTickers`) — une faute de frappe casse le partage de cache silencieusement.
- Clé = toutes les variables de la `queryFn`. Si l'utilisateur change, les données privées doivent changer : inclure `user.id` dans les clés privées **ou** faire `queryClient.clear()` au logout / changement de session.
- `staleTime` aligné sur le TTL Redis du BFF (inutile de refetch plus souvent que le cache serveur).
- Mutations : optimistic update = `cancelQueries` → snapshot → `setQueryData` → rollback dans `onError` → `invalidateQueries` dans `onSettled` (pattern déjà en place dans `usePodcast.ts`, à reproduire).
- `retry` : ne pas retenter les 4xx (401, 400, 429) — `retry: (count, err) => status >= 500 && count < 2`.
- Erreurs : `(err as ApiError).message` contient déjà le message du BFF.

## Auth & client HTTP
- Le token est injecté via `configureApi` → le client est recréé. Préférer **un intercepteur** axios qui lit le token courant à chaque requête (`supabase.auth.getSession()`), pour éviter toute requête partie avec un token périmé pendant un refresh.
- Sur 401 du BFF : tenter un refresh de session une fois, sinon `signOut` + redirection `/login`. Pas de boucle.
- `timeout` explicite (`DEFAULT_TIMEOUT_MS` 20 s, `GENERATION_TIMEOUT_MS` 120 s dans `services/api.ts`) — `timeout: 0` interdit.
- Toute erreur d'appel est une `ApiError { message, status, reqId }` (intercepteur dans `services/api.ts`) : afficher `message`, et le `reqId` quand c'est utile au support.
- `supabase.auth.getSession()` : gérer le rejet (`.catch`) sinon `loading` reste `true` à vie.

## React 19
- `useEffect` : toujours un cleanup (abonnements, `speechSynthesis.cancel()`, `URL.revokeObjectURL`, `AbortController`). StrictMode monte deux fois en dev : un effet non idempotent = bug visible.
- Pas de `useEffect` pour dériver un état d'un autre état ou de props → calcul direct ou `useMemo`. Pas d'effet pour réagir à un événement utilisateur → handler.
- Dépendances d'effet exactes (ESLint `react-hooks/exhaustive-deps` doit passer sans `disable`). Attention aux effets qui dépendent d'un état qu'ils modifient.
- `useRef` initialisé par un calcul coûteux (`useRef(splitForTts(script))`) recalcule à chaque render → `useMemo` ou init paresseuse.
- Listes : `key` stable issue de la donnée (id, ticker), jamais l'index si la liste est réordonnable.
- Ajouter un **Error Boundary** par route (React Router `errorElement`) : une exception dans un graphique ne doit pas blanchir toute l'app.

## Ant Design 5
- Messages/notifications via `App.useApp()` (contexte, thème respecté), pas l'import statique `message` d'antd.
- Formulaires : `Form` avec `rules` ; la validation client ne remplace jamais celle du BFF.
- Accessibilité : boutons-icônes avec `aria-label`, contrastes OK en thème clair **et** sombre, navigation clavier sur les actions principales.

## Performance
- Code-splitting des pages lourdes (`lazy()` sur Podcast, Recommendations — recharts est gros).
- `useQueries` sur N tickers × 4 requêtes : garder N borné, et envisager un endpoint batch côté BFF si N grandit.
- Pas de `JSON.stringify` / tri dans le render sur de gros tableaux sans `useMemo`.

## Structure de l'interface
- Navigation : 4 sections (`components/layout/nav.tsx`) — barre d'onglets en bas sous `md`, barre latérale au-delà (`AppLayout`). Le compte s'ouvre par l'avatar (`AccountButton`), pas par un onglet. `useIsMobile()` est la seule source du point de rupture.
- Fiche d'un actif = route enfant `…/asset/:symbol` (Watchlist et Idées) via `MasterDetail` : panneau du bas sur mobile, colonne sur PC. Ne pas recréer de fiche ailleurs.
- Lecteur podcast global : `lib/player.ts` (moteur testable, hors React) + `hooks/usePlayer.ts` (instance unique). Toute lecture d'épisode passe par `player.load()` ; ne jamais monter un second lecteur `speechSynthesis` dans une page privée.
- Chaque page commence par `PageHeader` et respecte les zones sûres iOS (`env(safe-area-inset-*)`, déjà gérées par le layout).

## PWA (installable sur iPhone)
- `public/manifest.webmanifest`, `public/sw.js`, balises Apple dans `index.html`. Tous les chemins sont **relatifs** (l'app peut vivre sous `BASE_PATH`).
- Service worker : seules les requêtes GET de même origine sont interceptées ; jamais le BFF, Supabase ni les images tierces. Changer la stratégie de la coquille ⇒ incrémenter `VERSION` dans `sw.js`.
- Icônes : `node scripts/generate-icons.mjs` (aucune dépendance). iOS exige une `apple-touch-icon` opaque et carrée.
- À vérifier sur un vrai iPhone après toute modification : installation, plein écran, barre d'état, zones sûres, lecture audio écran verrouillé.

## Configuration runtime
Les valeurs viennent de `window.__APP_CONFIG__` (substituées au boot du conteneur) avec fallback `import.meta.env.VITE_*` en dev. Toute nouvelle variable : `runtimeConfig.ts` + `public/config.js` + `docker-entrypoint.sh` + `.env.example` + `docker-compose.prod.yml`. Rien de secret côté web (seule la clé `anon` Supabase est publique par design).

## Vérification
`npm run typecheck`, lint, tests, puis lancer l'app (`npm run dev`) et vérifier le parcours touché dans le navigateur, thème clair et sombre, état de chargement, état d'erreur (couper le BFF) et état vide.
