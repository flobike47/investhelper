import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl, {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err: NodeJS.ErrnoException) => {
  // ioredis crie continuellement si Redis n'est pas up — on log une fois et on continue.
  // Les wrappers cached() retomberont en passthrough.
  if (err.code !== 'ECONNREFUSED') console.error('[redis]', err.message);
});

/** TTLs centralisés (secondes). Edits ici = un seul endroit à toucher. */
export const TTL = {
  quote: 60,
  candlesDaily: 60 * 60,           // 1 h
  candlesWeekly: 24 * 60 * 60,     // 24 h
  recommendations: 6 * 60 * 60,    // 6 h
  priceTarget: 6 * 60 * 60,        // 6 h
  earnings: 12 * 60 * 60,          // 12 h
  newsMarket: 30 * 60,             // 30 min
  newsWorld: 30 * 60,
  newsBusiness: 30 * 60,
  newsCompany: 30 * 60,
  search: 60 * 60,                 // 1 h
  fx: 6 * 60 * 60,                 // 6 h
  sentiment: 6 * 60 * 60,          // 6 h
  themes: 3 * 60 * 60,             // 3 h
  podcastScript: 24 * 60 * 60,     // 24 h
  tts: 30 * 24 * 60 * 60,          // 30 jours
} as const;

/**
 * Cache JSON. Si Redis est down → on passe en passthrough (appelle fn directement).
 * Erreurs de désérialisation tombent en passthrough aussi (clé corrompue).
 */
export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const raw = await redis.get(key);
    if (raw) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // valeur corrompue, on supprime et on régénère
        await redis.del(key);
      }
    }
  } catch {
    // Redis indisponible — on continue sans cache
  }

  const value = await fn();
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    /* swallow */
  }
  return value;
}

/**
 * Cache binaire (utilisé pour les chunks de TTS).
 */
export async function cachedBinary(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<Buffer>,
): Promise<Buffer> {
  try {
    const buf = await redis.getBuffer(key);
    if (buf && buf.length > 0) return buf;
  } catch {
    /* passthrough */
  }
  const value = await fn();
  try {
    await redis.setex(key, ttlSeconds, value);
  } catch {
    /* swallow */
  }
  return value;
}

/** Helper de hash stable pour des clés à partir d'entrées de longueur variable. */
export function hashKey(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16);
}
