# Yahoo Finance proxy — Cloudflare Worker

Mini proxy CORS + auth pour appeler les endpoints non-officiels de Yahoo Finance
depuis l'app InvestHelper. Gère le flow cookie + crumb que Yahoo exige depuis 2023.

## Pourquoi

Les providers financiers gratuits (Finnhub, FMP, Twelve Data) ont tous gated
leurs endpoints analystes en 2024-2025. Yahoo Finance reste accessible via ses
endpoints non-officiels, mais nécessite :

- un User-Agent navigateur
- un cookie de session
- un "crumb" anti-bot

→ impossible à faire directement depuis le navigateur (CORS + complexité du flow).

Ce Worker tourne sur Cloudflare (free tier 100k req/jour, largement suffisant),
gère la session Yahoo et renvoie les données en JSON avec les bons headers CORS.

## Déploiement (≈ 5 minutes)

### Pré-requis

- Un compte Cloudflare gratuit : https://dash.cloudflare.com/sign-up
- `npm install -g wrangler` puis `wrangler login`

### Étapes

```bash
cd worker/yahoo-proxy

# Optionnel mais recommandé : définir un secret partagé.
# Tape une chaîne aléatoire quand wrangler te le demande, et garde-la pour l'app.
wrangler secret put PROXY_SECRET

# Déployer
wrangler deploy
```

Wrangler te donnera une URL du type :
`https://investhelper-yahoo-proxy.<ton-compte>.workers.dev`

### Configuration dans l'app

1. Va dans **Réglages**
2. Colle l'URL du Worker dans le champ "URL du proxy Yahoo"
3. Colle le `PROXY_SECRET` que tu as choisi dans "Secret du proxy Yahoo"
4. Recharge la page Recommandations — les données analystes réapparaissent

## Endpoint exposé

```
GET https://<ton-worker>.workers.dev/quoteSummary/{symbol}?modules=recommendationTrend,financialData,calendarEvents
Authorization: Bearer <PROXY_SECRET>
```

Renvoie la réponse Yahoo brute :

```json
{
  "quoteSummary": {
    "result": [{
      "recommendationTrend": { "trend": [...] },
      "financialData": { "targetMeanPrice": {...}, ... },
      "calendarEvents": { "earnings": {...} }
    }],
    "error": null
  }
}
```

## Limites & avertissements

- **Yahoo n'est pas une API officielle.** Les endpoints peuvent changer à tout
  moment. Si ça casse, il faudra adapter le Worker.
- **Pas de redistribution.** Les données Yahoo sont destinées à un usage perso.
- **Anti-bot.** Yahoo peut bloquer ton Worker si trop de requêtes (très peu
  probable avec un usage perso et le cache TanStack côté app).

## Coût

Cloudflare Worker free tier : 100 000 requêtes/jour, 10 ms CPU par requête.
Tu peux faire tourner cet usage tout le mois sans dépasser, gratuitement.

## Debug local

```bash
wrangler dev
# puis :
curl http://localhost:8787/quoteSummary/AAPL?modules=recommendationTrend,financialData \
  -H "Authorization: Bearer <ton-secret>"
```
