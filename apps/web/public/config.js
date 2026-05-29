// Ce fichier est chargé AVANT le bundle JS principal (cf index.html).
// Les placeholders __XXX__ sont remplacés par les vraies valeurs au boot
// du conteneur Docker via /docker-entrypoint.sh (sed).
// En dev (npm run dev), les placeholders restent tels quels — runtimeConfig
// détecte ça et fait fallback sur les VITE_* de import.meta.env.
window.__APP_CONFIG__ = {
  BASE_PATH: "__BASE_PATH__",
  BFF_URL: "__BFF_URL__",
  SUPABASE_URL: "__SUPABASE_URL__",
  SUPABASE_ANON_KEY: "__SUPABASE_ANON_KEY__",
};
