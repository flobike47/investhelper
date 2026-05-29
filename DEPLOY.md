# Déploiement sur Raspberry Pi via Portainer

Flux cible :

```
push sur main
    │
    ▼
GitHub Actions (cross-build amd64 → arm64)
    │
    ▼
Registry privé (investhelper-bff:latest + investhelper-web:latest)
    │
    ▼
Portainer webhook (Pi) → pull + recreate des conteneurs
    │
    ▼
Caddy/Cloudflare Tunnel (host) → terminaison HTTPS
```

Tu fais juste `git push`, et 6 minutes plus tard la nouvelle version tourne sur la Pi.

---

## 1. Pré-requis sur la Pi

- Portainer CE installé (https://docs.portainer.io/start/install/server/docker/linux)
- Reverse proxy host pour TLS : Caddy (paquet apt) ou Cloudflare Tunnel
- Docker login vers ton registry (Portainer va gérer ça à ta place via "Registries")

## 2. Ajouter le registry dans Portainer

**Portainer UI → Registries → Add registry**

- **Name** : `mon-registry`
- **Registry URL** : `registry.example.com`
- **Authentication** : activé
- **Username / Password** : les credentials du registry

Portainer pourra ensuite pull les images privées automatiquement.

## 3. Créer la stack

**Portainer UI → Stacks → Add stack**

- **Name** : `investhelper`
- **Build method** : Web editor
- Colle le contenu de [`docker-compose.prod.yml`](./docker-compose.prod.yml)
- En bas, section **Environment variables** → ajoute toutes les clés du
  [`.env.prod.example`](./.env.prod.example) avec leurs vraies valeurs :

| Variable | Pour qui | Exemple |
|---|---|---|
| `BFF_IMAGE` | compose | `registry.example.com/investhelper-bff:latest` |
| `WEB_IMAGE` | compose | `registry.example.com/investhelper-web:latest` |
| `CORS_ORIGIN` | BFF | `https://tondomaine.com` |
| **`BFF_URL`** | **web (runtime)** | **`https://api.tondomaine.com`** |
| `SUPABASE_URL` | BFF + web | `https://xxx.supabase.co` |
| **`SUPABASE_ANON_KEY`** | **web (runtime)** | **`eyJ...` (clé anon, safe en client)** |
| `SUPABASE_SERVICE_ROLE_KEY` | BFF | `eyJ...` (⚠️ secret) |
| `FINNHUB_API_KEY` … `GEMINI_API_KEY` | BFF | tes clés providers |

> Les 3 lignes en gras sont injectées dans `/config.js` du conteneur web au
> démarrage. Tu peux les modifier dans Portainer puis redéployer la stack
> **sans rebuild d'image** — pratique pour changer de Supabase ou de BFF URL.

Clique **Deploy the stack**. Portainer pull les images et démarre les trois
conteneurs (bff, web, redis).

## 4. Activer le webhook de redeploy

Sur la stack créée : **onglet Webhooks → Create webhook**

Portainer génère une URL du type :

```
https://portainer.tondomaine.com/api/stacks/webhooks/<uuid>
```

**Copie-la** puis sur GitHub :

Repo → Settings → Secrets and variables → Actions → New secret :

- Name : `PORTAINER_WEBHOOK_URL`
- Value : l'URL ci-dessus

À partir de là, chaque push sur `main` :
1. CI build les deux images
2. Push sur le registry
3. POST sur le webhook → Portainer pull + recreate

## 5. Secrets GitHub Actions

Repo → Settings → Secrets and variables → Actions :

| Secret | Pour quoi |
|---|---|
| `REGISTRY_URL` | Host du registry (sans `https://`) |
| `REGISTRY_USERNAME` | Login push |
| `REGISTRY_USERPASSWORD` | Password / token push |
| `PORTAINER_WEBHOOK_URL` | URL du webhook stack (optionnel — sans, pas de redeploy auto) |

> Les `VITE_*` ne sont **plus** nécessaires côté CI : la config web est
> runtime (injectée par Portainer via env vars du conteneur), pas build-time.

## 6. TLS via Caddy ou Cloudflare Tunnel

Le compose bind les ports sur `127.0.0.1` (jamais exposés au LAN) :
- `127.0.0.1:8080` → web (Caddy interne du conteneur)
- `127.0.0.1:4000` → BFF

Configure ton reverse proxy host (hors Portainer) :

**Option A — Caddy** (`/etc/caddy/Caddyfile`) :

```caddy
tondomaine.com {
    reverse_proxy 127.0.0.1:8080
}

api.tondomaine.com {
    reverse_proxy 127.0.0.1:4000
}
```

```bash
sudo systemctl reload caddy
```

**Option B — Cloudflare Tunnel** (recommandé, pas d'IP publique exposée) :

```bash
cloudflared tunnel login
cloudflared tunnel create investhelper
```

Édite `~/.cloudflared/config.yml` :

```yaml
tunnel: <uuid>
credentials-file: /home/pi/.cloudflared/<uuid>.json

ingress:
  - hostname: tondomaine.com
    service: http://localhost:8080
  - hostname: api.tondomaine.com
    service: http://localhost:4000
  - service: http_status:404
```

```bash
cloudflared tunnel route dns investhelper tondomaine.com
cloudflared tunnel route dns investhelper api.tondomaine.com
sudo cloudflared service install
```

## 7. Vérifications

```bash
# Depuis la Pi
curl http://localhost:4000/health
# → {"ok":true,"ts":...}

curl http://localhost:8080/
# → HTML du SPA

# Depuis ton browser
https://tondomaine.com
https://api.tondomaine.com/health
```

Dans Portainer, regarde les logs en direct (Containers → bff → Logs) — tu dois voir :
```
🟢 BFF up on http://0.0.0.0:4000 (env=production)
```

## 8. Rollback

Le CI tag chaque image avec `latest` ET `sha-<7chars>`. Pour rollback à une
version précédente :

1. Stack `investhelper` → Editor
2. Change `BFF_IMAGE` ou `WEB_IMAGE` pour pointer sur `sha-abc1234`
3. Click **Update the stack**

Ou via webhook custom (si tu veux scripter).

## 9. Monitoring (suggéré)

- **Uptime** : UptimeRobot / Better Stack qui ping `https://api.tondomaine.com/health`
- **Logs persistés** : Portainer → Container settings → Restart policy = `unless-stopped` (déjà dans le compose), et active la rotation log Docker
- **Métriques** : Portainer affiche CPU/RAM live par conteneur

## 10. Mise à jour Portainer lui-même

```bash
docker pull portainer/portainer-ce:latest
docker stop portainer && docker rm portainer
docker run -d -p 9443:9443 --name portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

---

## Annexe — Build manuel (sans CI)

Si tu veux build à la main depuis ton laptop amd64 :

```bash
docker buildx create --use --name investhelper-builder

docker buildx build --platform linux/arm64 -f apps/bff/Dockerfile \
  -t registry.example.com/investhelper-bff:latest --push .

docker buildx build --platform linux/arm64 -f apps/web/Dockerfile \
  --build-arg VITE_BFF_URL=https://api.tondomaine.com \
  --build-arg VITE_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... \
  -t registry.example.com/investhelper-web:latest --push .
```

Puis dans Portainer : **Stacks → investhelper → Pull and redeploy**.

---

## Performance attendue sur Pi 5

- BFF : démarre en ~1 s, ~50 Mo RAM au repos
- Web (Caddy) : ~10 Mo RAM, gzip/zstd à la volée
- Redis : ~5 Mo + cache (capé à 256 Mo dans le compose)

Total : **~80 Mo RAM** avant cache. Largement OK sur Pi 4 2GB.
