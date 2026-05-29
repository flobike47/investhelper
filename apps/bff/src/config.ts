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

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

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
};
