# =============================================================================
# Web (Vite/React) — Dockerfile cross-platform avec config runtime
# =============================================================================
# Build:   linux/amd64 (CI / machine de dev) — image agnostique de la conf
# Runtime: linux/arm64 (Raspberry Pi), Caddy en static-files server
#
# CONFIGURATION RUNTIME
# ---------------------
# Cette image est **réutilisable** : pas de VITE_* figé dans le bundle.
# Les vraies valeurs sont injectées au boot via /config.js et <base href>,
# qui contiennent des placeholders __XXX__ remplacés par docker-entrypoint.sh.
#
# Variables runtime à passer au conteneur :
#   BASE_PATH            ex: /investhelper/   (défaut "/")
#   BFF_URL              ex: https://api.tondomaine.com
#   SUPABASE_URL         ex: https://xxx.supabase.co
#   SUPABASE_ANON_KEY    ex: eyJ...
# =============================================================================

FROM --platform=linux/amd64 node:22-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci --workspace @investhelper/web --include-workspace-root

COPY apps/web/tsconfig.json apps/web/tsconfig.app.json apps/web/tsconfig.node.json apps/web/vite.config.ts apps/web/index.html ./apps/web/
COPY apps/web/public ./apps/web/public
COPY apps/web/src ./apps/web/src

RUN npm run build --workspace @investhelper/web

# -----------------------------------------------------------------------------
FROM --platform=linux/arm64 caddy:2-alpine AS runtime

# Bundle statique :
#  - /srv.template = version "vierge" avec placeholders __XXX__
#  - /srv          = version servie (recopiée + substituée au boot)
# Cette duplication permet de re-substituer à chaque restart si les env
# vars ont changé entre-temps.
COPY --from=build /repo/apps/web/dist /srv.template
COPY --from=build /repo/apps/web/dist /srv

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost/config.js > /dev/null || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
