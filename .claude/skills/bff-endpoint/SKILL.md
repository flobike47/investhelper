---
name: bff-endpoint
description: Créer, modifier ou relire une route Fastify du BFF InvestHelper (apps/bff/src/routes/*). À utiliser dès qu'on touche une route API, l'auth, les quotas, le cache Redis, la validation des entrées ou les routes publiques /api/public/*.
---

# Routes BFF (Fastify 5) — standard de qualité

Le BFF est la seule frontière de confiance : il détient les clés payantes (Gemini, Finnhub…) et la clé `service_role` Supabase qui **bypass RLS**. Chaque route est donc un point d'abus potentiel sur la facture et sur les données des autres utilisateurs.

## Avant d'écrire

1. Lis `apps/bff/src/server.ts` (enregistrement, error handler), `auth.ts`, `validation.ts`, `cache.ts`, `ratelimit.ts`.
2. Cherche une route voisine qui fait déjà la même chose et **réutilise ses helpers** — ne duplique jamais une allowlist, un regex ou un validateur (l'allowlist de voix, dupliquée entre `podcast.ts` et `share.ts`, avait divergé ; elle vit désormais dans `src/tts.ts`). Erreurs typées et validateurs : `src/validation.ts` (`BadRequest`, `Unauthorized`, `NotFound`, `Gone`, `validateUuid`, `validateSymbol`…).

## Checklist obligatoire par route

### Entrées
- [ ] **Toute** entrée (params, query, body, headers) est validée avant usage. Préférer un schéma déclaratif (JSON Schema Fastify ou Zod via `fastify-type-provider-zod`) : Fastify valide, coerce et documente ; les génériques `app.get<{ Body: X }>` seuls ne valident **rien** au runtime.
- [ ] Les identifiants sont validés par format (UUID pour les ids DB, `validateSymbol` pour les tickers, regex pour les tokens). Un `req.params.id` passé tel quel à Supabase = 500 au lieu de 400.
- [ ] Tableaux et chaînes bornés (taille max) — protège le cache, la DB et la facture LLM.
- [ ] Pas de `decodeURIComponent` manuel sur des params : Fastify les décode déjà (double décodage = bug sur `%25`).

### Auth & autorisation
- [ ] Route privée → `const user = requireUser(req)` en première ligne (lève 401). Ne jamais tester `req.user` à la main.
- [ ] **Chaque** requête Supabase est scopée `.eq('user_id', user.id)` — y compris les lectures et les deletes. La clé service_role ne protège rien.
- [ ] Accès à une ressource par id → vérifier l'appartenance (ownership) avant toute action ; renvoyer 404 (pas 403) pour ne pas révéler l'existence.
- [ ] Route publique `/api/public/*` (pas d'auth) : elle doit (a) être gatée par un secret non devinable, (b) n'exposer **que** la ressource liée à ce secret, (c) avoir un rate-limit par IP, (d) ne jamais accepter de contenu arbitraire qui déclenche un appel payant. Modèle : `/api/public/podcast/:token/tts` reçoit un `chunkIndex`, jamais de texte, et a son quota `publicTts` par token.

### Coût & quotas
- [ ] Tout appel payant (Gemini, TTS) passe par `enforceQuota(user.id, bucket)` **avant** l'appel. Les routes publiques ont leur propre bucket (par token et/ou IP).
- [ ] Le quota est consommé uniquement sur cache miss (pattern actuel dans `cachedJson`) — garder ce comportement.
- [ ] Opérations Redis multi-étapes atomiques : `INCR` + `EXPIRE` séparés peuvent laisser une clé sans TTL (quota bloqué à vie). Utiliser `MULTI`/pipeline, `SET key 0 EX ttl NX` puis `INCR`, ou un script Lua.

### Cache
- [ ] Clé de cache = toutes les entrées qui changent le résultat, normalisées (tri, casse), et préfixées par domaine (`quote:`, `tts:`…). Si le résultat dépend de l'utilisateur, la clé contient `user.id`.
- [ ] TTL dans `TTL` de `cache.ts` (pas de nombres magiques dans les routes).
- [ ] Ne jamais mettre en cache une erreur ou un résultat vide transitoire (provider down) avec un TTL long.
- [ ] Redis down = passthrough, jamais une 500.

### Erreurs & réponses
- [ ] `setErrorHandler`/`setNotFoundHandler` doivent rester déclarés **avant** les `app.register(routes)` dans `server.ts` (sinon ils ne s'appliquent à aucune route).
- [ ] Lever des erreurs typées avec `statusCode` (`BadRequest`, `QuotaExceeded`, `ProviderError`) ; laisser le `setErrorHandler` global formater. Pas de `reply.code(x); return { error }` ad hoc qui contourne le format `{ error, reqId }`.
- [ ] Erreurs Supabase (`PostgrestError`) : ne pas les `throw` brutes (pas d'`Error`, pas de `statusCode` → 500 avec message SQL en dev). Les mapper (`23505` → 409, `22P02` → 400…).
- [ ] Déclarer un schéma de **réponse** quand c'est possible : Fastify sérialise plus vite et ne fuit pas de champs non prévus.
- [ ] Pas de `console.*` : utiliser `req.log` / `app.log` (pino, avec `reqId`).

### Concurrence
- [ ] Pas de « read-then-write » non atomique (compter puis insérer, lire max(position) puis insérer) : deux requêtes simultanées cassent l'invariant. Utiliser une contrainte DB, un `insert ... on conflict`, ou une fonction SQL (RPC) — voir skill `supabase-db`.

## Contrat front/back
Les types partagés vivent aujourd'hui en double (`apps/bff/src/types.ts` et `apps/web/src/types/*`, `services/api.ts`). Toute modif de forme de réponse doit mettre à jour les deux côtés dans le même commit. Cible : un package `packages/shared` avec les schémas Zod comme source unique.

## Tests attendus (voir skill `testing`)
Chaque nouvelle route : un test `app.inject()` pour le cas nominal, 401 sans token, 400 entrée invalide, isolation (user A ne voit pas les données de user B), et 429 quand le quota est atteint si applicable.

## Vérification
`npm run typecheck` + tests BFF, puis appel réel avec `curl` en local (`npm run dev:bff`) sur les cas nominaux et d'erreur.
