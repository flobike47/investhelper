import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/**
 * Adresse publique de l'app web, BASE_PATH compris (ex.
 * https://tondomaine.com/investhelper/), avec « / » final pour résoudre les
 * routes relatives. Par défaut : la première origine CORS, app servie à la
 * racine. Une URL invalide fait échouer le démarrage.
 */
export function resolveAppUrl(appUrl: string | undefined, corsOrigin: string): string {
  const first = corsOrigin.split(',')[0].trim();
  const url = new URL(appUrl ?? (first === '*' ? 'http://localhost:5173' : first));
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin,
  // Lien absolu des notifications push (format déclaratif, voir push.ts)
  appUrl: resolveAppUrl(opt('APP_URL'), corsOrigin),

  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  // Supabase — auth + DB
  // (la vérification JWT passe désormais par supabase.auth.getUser,
  // qui gère HS256 legacy ET ES256 signing keys — plus besoin du secret JWT)
  supabaseUrl: req('SUPABASE_URL'),
  supabaseServiceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),

  // Providers
  finnhubKey: opt('FINNHUB_API_KEY'),
  twelveDataKey: opt('TWELVE_DATA_API_KEY'),
  newsApiKey: opt('NEWSAPI_API_KEY'),
  fmpKey: opt('FMP_API_KEY'),
  geminiKey: opt('GEMINI_API_KEY'),

  // Notifications Web Push (VAPID) — optionnelles : sans les trois, la
  // fonctionnalité est désactivée (routes en 503, pas de rappel planifié).
  // Générer une paire : npx web-push generate-vapid-keys
  vapidPublicKey: opt('VAPID_PUBLIC_KEY'),
  vapidPrivateKey: opt('VAPID_PRIVATE_KEY'),
  vapidSubject: opt('VAPID_SUBJECT'), // mailto:toi@exemple.com
};
