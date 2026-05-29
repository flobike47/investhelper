import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import { config } from './config.js';
import { registerAuth } from './auth.js';
import { registerMarketRoutes } from './routes/market.js';
import { registerNewsRoutes } from './routes/news.js';
import { registerAnalysisRoutes } from './routes/analysis.js';
import { registerPodcastRoutes } from './routes/podcast.js';
import { registerFxRoutes } from './routes/fx.js';
import { registerUserRoutes } from './routes/user.js';

const IS_PROD = process.env.NODE_ENV === 'production';

export async function buildServer() {
  // En prod on refuse CORS=* — c'est trop ouvert pour un BFF qui parle à
  // des providers payants. Même si l'auth bloque, on évite tout risque
  // d'abuse via OPTIONS / fingerprint.
  if (IS_PROD && (config.corsOrigin === '*' || !config.corsOrigin)) {
    throw new Error(
      'CORS_ORIGIN doit être explicite en production (liste séparée par virgules). ' +
        'CORS=* est refusé.',
    );
  }

  const app = Fastify({
    // Limite par défaut Fastify = 1 Mo. On le redescend à 256 Ko : les
    // payloads légitimes (script podcast ~10Ko, TTS body ~1Ko) sont très
    // en deçà.
    bodyLimit: 256 * 1024,
    // genReqId pour la corrélation des logs
    genReqId: () => crypto.randomUUID(),
    disableRequestLogging: false,
    trustProxy: IS_PROD, // si derrière un reverse proxy (Caddy/Nginx/CF)
    logger: {
      level: config.logLevel,
      redact: {
        // Redaction des en-têtes sensibles dans les logs
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      transport: IS_PROD
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    },
  });

  // Compression des réponses JSON > 1 Ko (gzip/deflate/br selon Accept-Encoding).
  // Gain réseau important sur les listes de news/episodes/recommandations.
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip', 'deflate'],
  });

  await app.register(helmet, {
    // L'API ne sert pas de HTML, donc on désactive la CSP par défaut
    // (qui s'applique à * et bloque les iframes etc.). HSTS, X-Frame-Options
    // et X-Content-Type-Options restent activés par défaut.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });

  registerAuth(app);

  // Logging timing par requête — utile pour spotter une route lente en prod.
  // On marque les requêtes > 1s comme WARN pour qu'elles ressortent dans les logs.
  app.addHook('onResponse', (req, reply, done) => {
    const ms = reply.elapsedTime;
    const log = ms > 1000 ? req.log.warn.bind(req.log) : req.log.info.bind(req.log);
    log(
      { ms: Math.round(ms), status: reply.statusCode, method: req.method, url: req.url },
      ms > 1000 ? 'slow request' : 'request',
    );
    done();
  });

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await app.register(registerMarketRoutes, { prefix: '/api' });
  await app.register(registerNewsRoutes, { prefix: '/api' });
  await app.register(registerAnalysisRoutes, { prefix: '/api' });
  await app.register(registerPodcastRoutes, { prefix: '/api' });
  await app.register(registerFxRoutes, { prefix: '/api' });
  await app.register(registerUserRoutes, { prefix: '/api' });

  // Handler global : on log toujours en détail côté serveur (avec req.id),
  // mais en prod on ne renvoie qu'un message générique pour ne pas leaker
  // d'URL de provider, de stack, ou de header dans l'erreur axios.
  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number };
    const status = e.statusCode ?? 500;

    req.log.error(
      {
        err,
        reqId: req.id,
        method: req.method,
        url: req.url,
        userId: req.user?.id,
      },
      'request error',
    );

    if (status < 500) {
      // Erreurs 4xx restent informatives (badrequest, quota, etc.)
      reply.code(status).send({ error: e.message ?? 'Bad request', reqId: req.id });
      return;
    }

    // 5xx : message générique en prod, détaillé en dev
    reply.code(status).send({
      error: IS_PROD ? 'Internal error' : (e.message ?? 'Internal error'),
      reqId: req.id,
    });
  });

  // 404
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: 'Not found', reqId: req.id });
  });

  return app;
}
