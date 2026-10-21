---
name: external-provider
description: Intégrer ou modifier un fournisseur externe du BFF (Finnhub, Twelve Data, FMP, NewsAPI, Yahoo, FX, Supabase admin) dans apps/bff/src/providers/*. À utiliser pour tout appel HTTP sortant, chaîne de fallback, gestion de timeout/retry/429, ou ajout d'une nouvelle source de données.
---

# Fournisseurs externes — résilience et exactitude

Les providers sont gratuits/limités, non officiels (Yahoo) ou payants (Gemini). Le BFF tourne sur un Raspberry Pi : une requête pendue coûte une socket et un slot du pool keep-alive (`maxSockets: 20`).

## Règles non négociables

1. **Timeout explicite partout.** `timeout: 0` (= infini) est interdit. `createProviderClient(baseURL, provider, timeoutMs)` applique `DEFAULT_TIMEOUT_MS` (10 s) ; un appel `axios` direct doit passer `timeout: DEFAULT_TIMEOUT_MS`. Valeurs de référence : données marché 8 s, news 10 s, LLM texte 60 s, TTS 90 s. Passer un `AbortSignal` (`AbortSignal.timeout(ms)`) quand l'appel est déclenché par une requête client, pour annuler si le client part.
2. **Clés API hors URL.** Une clé en query string (`?token=`, `?key=`) finit dans les logs d'erreur axios, les proxies et les traces. Utiliser l'en-tête quand le provider le permet (déjà fait : Gemini `x-goog-api-key`, Finnhub `X-Finnhub-Token`, NewsAPI `X-Api-Key`, Twelve Data `Authorization: apikey …` ; FMP n'accepte que la query string).
3. **Valider la réponse.** Un provider peut renvoyer 200 avec `{ error: ... }`, un tableau vide, `s: 'no_data'`, ou des `null`/`0` à la place de valeurs. Parser avec un schéma (Zod) à la frontière et normaliser vers les types internes (`types.ts`). Un prix à `0` n'est pas un prix.
4. **Erreurs typées.** Toujours `ProviderError(message, status, provider)`. Mapper le statut amont vers un statut BFF sensé : amont 5xx/timeout → 502/504, amont 429 → 503 + `Retry-After`, clé manquante → 503. Ne jamais propager un 401 amont comme un 401 BFF (le front croirait que la session est expirée).
5. **Retry seulement si idempotent et transitoire** (timeout, ECONNRESET, 502/503/504, 429 avec `Retry-After`) : max 2 retries, backoff exponentiel + jitter. Jamais de retry sur 4xx métier ni sur un appel facturé non idempotent (génération LLM) sans le vouloir explicitement.
6. **Fallback chain** (Yahoo → FMP → Finnhub) : chaque maillon renvoie `null` pour « pas de données » et **throw** pour « panne ». Logguer quel maillon a servi (`provider` dans le log) pour savoir en prod quel fournisseur est cassé. Ne pas cacher 6 h un `null` dû à une panne temporaire.
7. **Respect des rate-limits.** Concurrence bornée par provider (pattern `limited()` de `yahoo.ts`) + cooldown partagé dans Redis après 429. Pour un nouveau provider, documenter sa limite (ex. Finnhub free = 60 req/min) en tête de fichier.
8. **État module-level** (`cachedSession` Yahoo, compteurs) : penser au fait qu'il est par process et perdu au redémarrage ; tout ce qui doit survivre ou être partagé va dans Redis.

## Ajouter un provider — étapes
1. Créer `providers/<name>.ts` via `createProviderClient(baseURL, '<Name>')`.
2. Clé dans `config.ts` via `opt()` (provider optionnel) ou `req()` (obligatoire) + `.env.example` + `docker-compose.prod.yml` + `.env.prod.example`.
3. Types de réponse + schéma de validation ; fonctions exportées qui renvoient des types internes, jamais la forme brute du provider.
4. Cache dans la route (pas dans le provider) avec un TTL de `cache.ts`.
5. Tests : réponses enregistrées (fixtures JSON) rejouées via `nock`/`msw` — nominal, vide, 429, 500, timeout, JSON malformé.

## Dates et fuseaux
Les marchés ont des fuseaux (NYSE = America/New_York, Euronext = Europe/Paris). `toISOString().slice(0,10)` donne la date **UTC** : correct pour un cache key journalier, faux pour « aujourd'hui en bourse ». Les timestamps Finnhub sont en secondes, ceux de JS en millisecondes — toujours nommer l'unité (`tSec`, `tMs`).

## Vérification
Tester le provider réellement une fois en local (`npm run dev:bff` + `curl`) puis couper le réseau / mettre une mauvaise clé pour vérifier que le BFF renvoie une erreur propre et rapide, sans pendre.
