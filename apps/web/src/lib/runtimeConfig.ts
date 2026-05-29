/**
 * Configuration runtime — lue depuis window.__APP_CONFIG__ qui est rempli
 * au boot du conteneur Docker par /docker-entrypoint.sh (sed sur les
 * placeholders __XXX__ en fonction des variables d'env passées par Portainer).
 *
 * Fallback automatique vers import.meta.env.VITE_* en dev (npm run dev),
 * où les placeholders ne sont jamais substitués.
 */

declare global {
  interface Window {
    __APP_CONFIG__?: {
      BASE_PATH?: string;
      BFF_URL?: string;
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
    };
  }
}

/** Retourne `v` si c'est une vraie valeur, sinon `fallback`.
 *  Une valeur qui ressemble à `__FOO__` est considérée comme un placeholder
 *  non substitué (cas dev). */
function realOr(v: string | undefined, fallback: string): string {
  if (!v) return fallback;
  if (v.startsWith('__') && v.endsWith('__')) return fallback;
  return v;
}

const win = typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined;

/** Normalise un base path : toujours `/foo/` (slash début + fin), ou `/` racine. */
function normalizeBase(p: string): string {
  let s = p.trim();
  if (!s || s === '/') return '/';
  if (!s.startsWith('/')) s = '/' + s;
  if (!s.endsWith('/')) s = s + '/';
  return s;
}

export const runtimeConfig = {
  basePath: normalizeBase(realOr(win?.BASE_PATH, '/')),
  bffUrl: realOr(win?.BFF_URL, import.meta.env.VITE_BFF_URL ?? 'http://localhost:4000'),
  supabaseUrl: realOr(win?.SUPABASE_URL, import.meta.env.VITE_SUPABASE_URL ?? ''),
  supabaseAnonKey: realOr(win?.SUPABASE_ANON_KEY, import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''),
};
