# InvestHelper

Application web d'aide à l'investissement actions/ETF avec analyse de sentiment
news et génération de podcast quotidien.

Multi-utilisateur via Supabase + Google OAuth. Architecture en monorepo :

```
investhelper/
├── apps/
│   ├── web/        React 19 + Vite 6 + AntD + TanStack Query + supabase-js (auth)
│   └── bff/        Fastify + Redis (cache + quotas) + Supabase (DB) + providers
├── supabase/       Schéma SQL + doc setup (Google OAuth, RLS, clés)
├── docker-compose.yml   # Redis local
└── worker/         (déprécié, voir worker/yahoo-proxy/DEPRECATED.md)
```

## Pourquoi un BFF + Supabase

- **Multi-utilisateur** : login Google via Supabase. Chaque user a sa watchlist,
  ses catégories podcast et son historique d'épisodes en DB.
- **Sécurité** : aucune clé API exposée au navigateur. Le frontend ne connaît
  que l'URL du BFF + le JWT Supabase fraîchement émis.
- **Cache Redis agressif** : sentiment 6h, thèmes 3h, candles 1h, TTS 30 jours.
  Économies massives sur Gemini et bande passante.
- **Quotas par utilisateur** : 200 sentiments/jour, 100 thèmes/jour,
  20 podcasts/jour, 1000 TTS/jour — protège ta facture Gemini si tu ouvres
  publiquement.
- **Fallback centralisé** : Yahoo → FMP → Finnhub pour les recos analystes,
  géré côté serveur. Le frontend fait UNE requête, le BFF compose.
- **Cookie+crumb Yahoo** : gérés côté Node (sinon CORS bloque depuis le browser).

## Stack

| Côté | Tech |
|------|------|
| Frontend | React 19, Vite 6, TypeScript, Ant Design 5, TanStack Query, Zustand, Recharts |
| BFF | Fastify 5, ioredis, axios, dotenv, Pino |
| Cache | Redis 7 (docker-compose pour dev) |
| Providers | Finnhub, Twelve Data, FMP, NewsAPI, Yahoo Finance (non officiel), Gemini (analyse + TTS), open.er-api.com (FX) |

## Démarrage rapide

### 1. Supabase (auth + DB)

Suis [`supabase/README.md`](./supabase/README.md) :
1. Crée un projet gratuit sur supabase.com
2. Active Google OAuth (Authentication → Providers → Google)
3. Exécute `supabase/migrations/001_initial.sql` dans le SQL Editor
4. Récupère URL + anon key + service_role key + JWT secret

### 2. Clés providers (gratuites)

- **Finnhub** : https://finnhub.io/register
- **Twelve Data** : https://twelvedata.com/register
- **NewsAPI** : https://newsapi.org/register
- **Financial Modeling Prep** (optionnel) : https://site.financialmodelingprep.com/
- **Gemini** : https://aistudio.google.com/apikey

> Gemini TTS (synthèse vocale du podcast) nécessite d'activer le billing
> sur ta clé AI Studio. Le reste de Gemini est gratuit.

### 3. Installation

```bash
npm install                 # installe tous les workspaces
docker compose up -d redis  # Redis local sur :6379
```

### 4. Configuration BFF

```bash
cp apps/bff/.env.example apps/bff/.env
```

Édite `apps/bff/.env` avec les valeurs de Supabase + les clés providers.

### 5. Configuration Web

```bash
cp apps/web/.env.example apps/web/.env
```

Édite `apps/web/.env` :
```env
VITE_BFF_URL=http://localhost:4000
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 6. Lancer

```bash
npm run dev    # lance BFF (:4000) ET web (:5173) en parallèle
```

Ouvre http://localhost:5173 → "Se connecter avec Google" → l'app est prête.

## Stratégie de cache (Redis)

| Endpoint | TTL | Raison |
|----------|-----|--------|
| Quote | 60 s | Prix temps réel |
| Candles (D) | 1 h | Daily data, change peu intraday |
| Candles (W/M) | 24 h | Weekly/monthly |
| Recommandations | 6 h | Mise à jour rare |
| Price target | 6 h | Idem |
| Earnings | 12 h | Dates publiées à l'avance |
| News (toutes) | 30 min | Fraîcheur sans tuer NewsAPI |
| Sentiment ticker | 6 h | Économise tokens Gemini |
| Thèmes marché | 3 h | Idem |
| Script podcast | 24 h | Un par jour par combinaison de catégories |
| **TTS audio** | **30 jours** | **Déterministe : même texte = même audio** |
| FX rates | 6 h | Update quotidienne BCE |

Le cache TTS est par **chunk** : le frontend découpe le dialogue par tour de
parole, chaque chunk est haché et caché individuellement. Réécouter un épisode
ne coûte rien. Générer un nouvel épisode qui contient des phrases déjà vues
non plus.

## Endpoints BFF

| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/health` | Health check, pas d'auth |
| GET | `/api/quote/:symbol` | Quote temps réel |
| GET | `/api/profile/:symbol` | Profil entreprise |
| GET | `/api/candles/:symbol?resolution=D&lookbackDays=120` | Historique OHLC |
| GET | `/api/recommendations/:symbol` | Recos analystes (Yahoo → FMP → Finnhub) |
| GET | `/api/price-target/:symbol` | Cible analystes |
| GET | `/api/earnings/:symbol` | Prochain earning |
| GET | `/api/search?q=` | Recherche tickers |
| GET | `/api/news/market` | News marchés FR |
| GET | `/api/news/world` | Headlines monde FR |
| GET | `/api/news/business` | Headlines éco FR |
| GET | `/api/news/company/:symbol?days=14` | News par entreprise |
| GET | `/api/fx` | Taux EUR → autres devises |
| GET | `/api/analysis/sentiment/:symbol` | Sentiment Gemini |
| GET | `/api/analysis/themes?sectors=ai,semis,...` | Thèmes du jour |
| POST | `/api/podcast/script` | Génère script (body: { categories, targetMinutes }) |
| POST | `/api/podcast/tts` | Synthèse audio (body: { text, speakers }) |

**Endpoints user** (CRUD préférences) :

| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/api/user/me` | Identité utilisateur courante |
| GET / PUT | `/api/user/settings` | Horizon + thème |
| GET / POST / DELETE | `/api/user/watchlist[/:ticker]` | Watchlist |
| GET / POST / DELETE | `/api/user/podcast/categories[/:name]` | Catégories podcast |
| GET / POST / DELETE | `/api/user/podcast/episodes[/:id]` | Épisodes générés |
| GET | `/api/user/quotas` | Compteurs des quotas du jour |

Toutes les routes `/api/*` exigent `Authorization: Bearer <Supabase JWT>`.

## Quotas par utilisateur (Redis, fenêtre 24h)

| Bucket | Limite | Endpoints concernés |
|---|---|---|
| sentiment | 200/jour | `/api/analysis/sentiment/:symbol` |
| themes | 100/jour | `/api/analysis/themes` |
| podcastScript | 20/jour | `/api/podcast/script` |
| podcastTts | 1000/jour | `/api/podcast/tts` |

Les quotas ne sont décrémentés que sur les **MISS de cache** — un cache hit
ne consomme rien. Affichés dans Réglages.

## Scripts

| Commande | Description |
|----------|-------------|
| `npm install` | Installe les workspaces |
| `npm run dev` | Lance BFF + web en parallèle |
| `npm run dev:bff` | BFF seul (port 4000) |
| `npm run dev:web` | Web seul (port 5173) |
| `npm run build` | Build BFF + web |
| `npm run typecheck` | TS check sur tout |
| `npm run redis:up` | Démarre Redis via docker compose |
| `npm run redis:down` | Stoppe Redis |

## Limites & avertissements

- **Yahoo non officiel** : leurs endpoints peuvent casser. Le code dégrade en
  silence (renvoie null) si ça arrive.
- **Pas de conseil financier** : tous les "scores" sont informationnels. La
  décision et le risque restent à l'utilisateur.
- **Gemini TTS payant** : ~0,01 € par épisode de 4 min. Active le billing sur
  ta clé AI Studio si tu veux la voix HD. Sinon, la voix navigateur est gratuite.

## Passage en production — checklist

- [x] **Helmet** (security headers) sur le BFF
- [x] **Body limit** 256 Ko sur Fastify
- [x] **Validation/bornage** de toutes les entrées (symboles, days, lookback, TTS text, voix, …)
- [x] **CORS gate** prod : refuse `*` et force `CORS_ORIGIN` explicite quand `NODE_ENV=production`
- [x] **Error masking** : 5xx renvoie message générique en prod (+ reqId pour corrélation)
- [x] **Log redaction** des headers Authorization / Cookie
- [x] **Quotas par user** Redis (sentiment / themes / podcastScript / podcastTts)
- [x] **Limites par user** côté DB : 100 tickers, 20 catégories, 100 épisodes
- [x] **Auth JWT Supabase** vérifié via `auth.getUser` (HS256 + ES256), cache Redis 5 min
- [x] **Shutdown propre** : SIGINT/SIGTERM → Fastify.close + redis.quit
- [x] **Dockerfile** multi-stage non-root + HEALTHCHECK
- [x] **SQL schema** committé dans `supabase/migrations/`

### Avant de déployer

1. `NODE_ENV=production` dans l'environnement du BFF
2. `CORS_ORIGIN=https://ton-domaine.com` (jamais `*`)
3. TLS terminator devant le BFF (Caddy / Nginx / Cloudflare). Le BFF est HTTP simple.
4. Redis managé (Upstash / Redis Cloud) ou conteneur séparé avec auth/TLS
5. Variables Supabase de prod (URL, service_role, anon)
6. Configure les **URL Configuration** Supabase avec ton vrai domaine

### Déploiement

Voir **[DEPLOY.md](./DEPLOY.md)** — Dockerfiles cross-platform (build sur amd64,
runtime arm64 sur Raspberry Pi), compose de prod, Caddy + Let's Encrypt.

### À faire ensuite

- [ ] CI GitHub Actions qui build + push automatiquement vers le registry
- [ ] Cloudflare Tunnel pour HTTPS sans IP publique
- [ ] Page Portefeuille (positions ouvertes, PRU, P&L latent)
- [ ] Cron quotidien pour pré-générer le podcast à 7h
- [ ] Backtest des playbooks sur historique réel
- [ ] Rate-limit IP (en plus du quota par user) pour le path /api/* non authentifié
