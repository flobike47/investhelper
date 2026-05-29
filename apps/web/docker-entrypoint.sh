#!/bin/sh
set -eu

# Substitue les placeholders __XXX__ dans les fichiers servis par Caddy
# (/srv/index.html et /srv/config.js) à partir des variables d'env du
# conteneur (passées par Portainer au déploiement).
#
# Re-applique la substitution à chaque boot en repartant du template vierge
# (/srv.template/), pour que changer une env var puis restart le conteneur
# suffise — pas besoin de recreate.
#
# Variables (avec fallback sur le préfixe VITE_* pour rétro-compat) :
#   BASE_PATH            (défaut "/")        — sous-chemin de l'app (ex: /investhelper/)
#   BFF_URL              — URL publique du BFF       — OU VITE_BFF_URL
#   SUPABASE_URL         — URL Supabase              — OU VITE_SUPABASE_URL
#   SUPABASE_ANON_KEY    — clé anon Supabase         — OU VITE_SUPABASE_ANON_KEY

TEMPLATE=/srv.template
TARGET=/srv

if [ ! -d "$TEMPLATE" ]; then
  echo "[entrypoint] $TEMPLATE introuvable, abort"
  exit 1
fi

# 1. Restaure une version vierge à partir du template
#    (on ne touche pas aux fichiers d'assets versionnés, juste à index.html et config.js)
cp -f "$TEMPLATE/index.html" "$TARGET/index.html"
cp -f "$TEMPLATE/config.js"  "$TARGET/config.js"

# 2. Normalise BASE_PATH : toujours en /foo/ (slash début + fin), ou / racine
RAW_BASE="${BASE_PATH:-/}"
case "$RAW_BASE" in
  /*) ;;
  *)  RAW_BASE="/$RAW_BASE" ;;
esac
case "$RAW_BASE" in
  */) EFFECTIVE_BASE_PATH="$RAW_BASE" ;;
  *)  EFFECTIVE_BASE_PATH="$RAW_BASE/" ;;
esac

EFFECTIVE_BFF_URL="${BFF_URL:-${VITE_BFF_URL:-}}"
EFFECTIVE_SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
EFFECTIVE_SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-}}"

# 3. Substitue (délimiteur # car les valeurs contiennent / et =)
sed -i \
  -e "s#__BASE_PATH__#${EFFECTIVE_BASE_PATH}#g" \
  "$TARGET/index.html"

sed -i \
  -e "s#__BASE_PATH__#${EFFECTIVE_BASE_PATH}#g" \
  -e "s#__BFF_URL__#${EFFECTIVE_BFF_URL}#g" \
  -e "s#__SUPABASE_URL__#${EFFECTIVE_SUPABASE_URL}#g" \
  -e "s#__SUPABASE_ANON_KEY__#${EFFECTIVE_SUPABASE_ANON_KEY}#g" \
  "$TARGET/config.js"

echo "[entrypoint] runtime config :"
echo "  BASE_PATH=${EFFECTIVE_BASE_PATH}"
echo "  BFF_URL=${EFFECTIVE_BFF_URL:-<empty>}"
echo "  SUPABASE_URL=${EFFECTIVE_SUPABASE_URL:-<empty>}"
echo "  SUPABASE_ANON_KEY=$(printf '%.10s…' "${EFFECTIVE_SUPABASE_ANON_KEY:-<empty>}")"

if [ -z "${EFFECTIVE_BFF_URL}" ] || [ -z "${EFFECTIVE_SUPABASE_URL}" ] || [ -z "${EFFECTIVE_SUPABASE_ANON_KEY}" ]; then
  echo "[entrypoint] ⚠️  Une ou plusieurs variables sont vides. Le frontend va échouer."
  echo "[entrypoint]    Configure BFF_URL, SUPABASE_URL et SUPABASE_ANON_KEY dans Portainer."
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
