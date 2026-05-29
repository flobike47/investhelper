# InvestHelper

Application web (desktop + mobile) d'aide à l'investissement actions/ETF avec
données de marché **réelles** et flux d'actualités.

> Pas de conseils financiers. Les signaux sont calculés à partir de données
> publiques (Finnhub, NewsAPI). À toi de valider avant d'agir.

## Stack

- **React 19** + **TypeScript** + **Vite 6**
- **Ant Design 5** (UI)
- **TanStack Query** (cache & dédup des appels)
- **Zustand** (state + persistance localStorage)
- **Recharts** (graphes)
- **React Router 7**
- Axios pour le HTTP, dayjs pour les dates

## Architecture

```
src/
├── components/         # UI réutilisable (layout, stocks, common)
├── pages/              # Une page par route
├── services/           # Wrappers API (Finnhub, NewsAPI) — point unique d'I/O
├── hooks/              # React Query hooks
├── lib/                # Logique pure (indicateurs, scoring)
├── store/              # Zustand stores
├── types/              # Types DTO des APIs
└── constants/          # Configuration horizons d'investissement
```

La couche `services/` isole les appels externes : pour migrer vers un backend
proxy plus tard, on ne touche qu'à ces deux fichiers.

## Démarrage

### 1. Installer les dépendances

```bash
npm install
```

### 2. Obtenir les clés API (gratuites)

- **Finnhub** : https://finnhub.io/register — cotations temps réel, news financières
- **Twelve Data** : https://twelvedata.com/register — historique OHLC pour les indicateurs techniques (800 req/jour)
- **NewsAPI** : https://newsapi.org/register — actualités monde + business
- **Mistral** : https://console.mistral.ai/ — analyse sémantique des news (sentiment par action + extraction des thèmes mondiaux)
- **Yahoo Finance proxy** (optionnel mais fortement recommandé) — Cloudflare Worker que tu déploies toi-même. Voir [`worker/yahoo-proxy/README.md`](./worker/yahoo-proxy/README.md). Donne accès gratuitement aux recommandations analystes, price targets et earnings — les seules données qu'aucun provider gratuit ne fournit plus en 2024-2025.
- **Financial Modeling Prep** (optionnel, fallback) : https://site.financialmodelingprep.com/developer/docs — leur free tier ne couvre presque plus les endpoints analystes, donc le Worker Yahoo est plus utile

> Pourquoi tant de providers : Finnhub a progressivement migré ses endpoints
> les plus utiles (candles, recommandations, price targets) vers son plan
> payant en 2024. On compose donc avec plusieurs free tiers. L'app dégrade
> gracieusement si un provider est indisponible : tu vois juste moins de
> signaux, jamais d'erreur bloquante.

> Note CORS Mistral : si tu vois une erreur "Failed to fetch" sur les
> appels Mistral, c'est que ton tenant n'autorise pas les appels directs
> depuis le navigateur. Il faudra mettre un mini proxy (ex: Cloudflare
> Worker, Vercel Edge Function) qui forward `api.mistral.ai/v1/chat/completions`
> en ajoutant le header Authorization côté serveur.

### 3. Configurer les clés

Deux options :

**Option A — fichier .env (préféré pour dev local)**

```bash
cp .env.example .env
# édite .env et colle tes clés
```

**Option B — directement dans l'UI**

Lance l'app, va dans **Réglages** et colle tes clés. Elles seront persistées
dans le localStorage.

### 4. Lancer

```bash
npm run dev
```

Ouvre http://localhost:5173

## Sécurité — important

Cette app appelle Finnhub et NewsAPI directement depuis le navigateur. Les
clés API sont donc présentes dans le bundle JS livré au client.

C'est **acceptable pour un usage strictement perso/local**. Avant tout
déploiement public, il faut :

1. Créer un backend (Express, Hono, Cloudflare Workers, etc.)
2. Y déplacer les wrappers `src/services/finnhub.ts` et `src/services/newsapi.ts`
3. Faire pointer le frontend vers ce proxy

L'architecture est faite pour que ça se résume à changer la `baseURL` et
retirer le paramètre `token` des appels.

## Fonctionnalités

- **Tableau de bord** :
  - Vue d'ensemble de la watchlist (prix, signal, sparkline, entrée/sortie technique)
  - **Analyse par actif** : sentiment des news 14 jours (Mistral), prochains earnings, analog historique
- **Recommandations pilotées par l'actualité** (univers de ~70 titres curés) :
  - Mistral lit les news du jour → extrait les 3-5 thèmes dominants (IA, défense, énergie, etc.) avec direction (bullish/bearish)
  - On sélectionne les titres exposés à ces thèmes
  - Scoring combiné (signal technique + consensus analystes + biais thématique)
  - Top 5 avec **plan d'action** : fenêtre d'entrée conditionnelle (pas une date), conditions de sortie chiffrées (cible analyste, stop sur MA), horizon de détention, gestion du risque
  - **Analog historique** : sur les bougies réelles du titre, médiane des retours observés après des setups similaires (bucket RSI)
- **Watchlist** : recherche tickers via Finnhub, ajout/suppression
- **Actualités** : 3 onglets (monde, business, marchés financiers)
- **Réglages** : horizon court/moyen/long, thème, clés API

> ⚠️ Aucune prédiction de prix chiffrée n'est faite. Les "prédictions" sont
> des **synthèses informationnelles** : sentiment news, conditions d'entrée/sortie
> techniques, statistiques historiques. La décision et le risque restent à toi.

Les horizons modifient les indicateurs utilisés :
- **Court terme** : SMA 20/50 + RSI 14 sur 120 jours
- **Moyen terme** : SMA 50/200 + RSI 14 sur 1 an
- **Long terme** : SMA 50/200 sur 3 ans en bougies hebdomadaires

## Scripts

| Commande            | Description                            |
|---------------------|----------------------------------------|
| `npm run dev`       | Serveur dev Vite                       |
| `npm run build`     | Build prod (tsc + vite build)          |
| `npm run preview`   | Preview du build prod                  |
| `npm run typecheck` | TypeScript strict, sans émettre        |

## Limites du free tier

- **Finnhub free** : 60 req/min. Plusieurs endpoints sont passés premium en 2024 (candles, recommandations, price targets, earnings calendar) — l'app les gère en 403/null sans casser.
- **Twelve Data free** : 8 req/min, 800 req/jour. Candles mis en cache 1h.
- **FMP free** : 250 req/jour. Recos analystes en cache 6h.
- **NewsAPI free** : developer only, pas d'usage commercial, 100 req/jour.
- **Mistral** : pay-as-you-go (~0,001€ par analyse avec `mistral-small-latest`).

Si tu dépasses, soit tu prends un plan payant, soit tu mets en place un proxy
qui cache plus longtemps côté serveur.
