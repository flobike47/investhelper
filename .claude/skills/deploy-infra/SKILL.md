---
name: deploy-infra
description: Modifier le CI/CD, les Dockerfiles, docker-compose, Caddy, l'entrypoint de config runtime ou le déploiement Raspberry Pi (arm64 via Portainer) d'InvestHelper. À utiliser pour .github/workflows/*, apps/*/Dockerfile, docker-compose*.yml, Caddyfile, docker-entrypoint.sh, DEPLOY.md, ou une nouvelle variable d'environnement.
---

# Déploiement & infra

## Topologie
GitHub Actions (amd64, buildah + QEMU) → images arm64 `investhelper-bff` / `investhelper-web` taguées `latest` + `sha-<7>` → registry privé → webhook Portainer → stack `docker-compose.prod.yml` sur le Pi (Redis interne, BFF et web bindés sur `127.0.0.1`, TLS par un Caddy global en amont).

## Règles
1. **Qualité avant déploiement.** `ci.yml` (réutilisable, aussi lancé sur chaque PR) est appelé en premier par `build-and-push.yml` ; `build-bff` et `build-web` en dépendent (`needs: [quality]`). Ne jamais retirer cette dépendance ni ajouter un job de déploiement qui la contourne. Un nouveau contrôle (ex. audit, e2e) s'ajoute dans `ci.yml`.
2. **Rollback possible.** Le tag `sha-xxxxxxx` est la vérité ; `latest` n'est qu'un raccourci. Documenter dans `DEPLOY.md` comment repasser `BFF_IMAGE`/`WEB_IMAGE` sur un sha précédent dans Portainer.
3. **Actions épinglées.** Versions majeures au minimum, idéalement SHA de commit pour les actions tierces ; `permissions:` minimales au niveau du workflow (`contents: read`).
4. **Secrets.** Jamais en `build-arg` ni dans une image : l'image web est agnostique de la config (substitution au boot par `docker-entrypoint.sh`), le BFF lit ses variables à l'exécution. Ne pas `echo` de secrets dans les logs CI.
5. **Images.** Multi-stage, `npm ci` (lockfile respecté), `npm prune --omit=dev`, utilisateur non-root, `HEALTHCHECK`, `.dockerignore` à jour. Base `node:22-alpine` : suivre les versions LTS ; Node 22 est en maintenance, prévoir la montée sur la LTS suivante.
6. **Nouvelle variable d'env** : `config.ts` (BFF, `req`/`opt`) ou `runtimeConfig.ts` + `public/config.js` + `docker-entrypoint.sh` (web) **et** `.env.example`, `.env.prod.example`, `docker-compose.prod.yml`, `DEPLOY.md`. Une variable manquante doit faire échouer le démarrage du BFF clairement (`req()`), pas plus tard au premier appel.
7. **Ressources Pi.** Redis `maxmemory 256mb` + `allkeys-lru` : les gros blobs TTS (30 jours) peuvent évincer quotas et sessions auth → envisager une politique `volatile-lru` ou une instance/DB dédiée si la mémoire sature. Ajouter des `deploy.resources.limits` mémoire au BFF.
8. **Health.** `/health` doit refléter l'état réel minimal (process vivant) ; un `/ready` peut vérifier Redis. Ne pas faire dépendre `/health` des providers externes (sinon Portainer redémarre en boucle quand Finnhub tombe).
9. **Arrêt propre.** SIGTERM → `app.close()` → `redis.quit()` (déjà en place dans `index.ts`) ; garder ce comportement, et que `unhandledRejection` déclenche aussi un arrêt propre plutôt qu'un simple log.

## Vérification
- Builder localement l'image modifiée : `docker buildx build --platform linux/arm64 -f apps/<app>/Dockerfile -t test --load .` puis lancer le conteneur et taper `/health` (BFF) ou `/config.js` (web).
- Workflow : valider la syntaxe (`actionlint` si disponible) avant de pousser.
- Ne jamais déclencher un déploiement prod (push sur `main`, webhook) sans accord explicite de l'utilisateur.
