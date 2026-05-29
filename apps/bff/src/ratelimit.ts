import { redis } from './cache.js';

/**
 * Quotas par utilisateur — protège la facture Gemini si plusieurs users.
 * Fenêtre glissante simple via INCR + EXPIRE.
 */
export const QUOTAS = {
  sentiment: { max: 200, windowSec: 24 * 60 * 60 },
  themes:    { max: 100, windowSec: 24 * 60 * 60 },
  podcastScript: { max: 20, windowSec: 24 * 60 * 60 },
  podcastTts:    { max: 1000, windowSec: 24 * 60 * 60 },
} as const;

export type QuotaBucket = keyof typeof QUOTAS;

export class QuotaExceeded extends Error {
  statusCode = 429;
  constructor(public bucket: QuotaBucket, public limit: number, public ttl: number) {
    super(`Quota dépassé pour ${bucket} (max ${limit}/24h). Réessaye dans ${Math.ceil(ttl / 60)} min.`);
  }
}

export async function enforceQuota(userId: string, bucket: QuotaBucket): Promise<void> {
  const { max, windowSec } = QUOTAS[bucket];
  const key = `quota:${bucket}:${userId}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSec);
    }
    if (count > max) {
      const ttl = await redis.ttl(key);
      throw new QuotaExceeded(bucket, max, ttl > 0 ? ttl : windowSec);
    }
  } catch (e) {
    // Si Redis est down on laisse passer (passthrough) — on ne veut pas
    // bloquer l'app sur un Redis cassé. Le QuotaExceeded passe quand même
    // car on l'a throw.
    if (e instanceof QuotaExceeded) throw e;
  }
}

/** Helper pour lire l'état d'un quota (utilisé par /api/user/quotas). */
export async function readQuota(userId: string, bucket: QuotaBucket) {
  const { max, windowSec } = QUOTAS[bucket];
  try {
    const [countStr, ttl] = await Promise.all([
      redis.get(`quota:${bucket}:${userId}`),
      redis.ttl(`quota:${bucket}:${userId}`),
    ]);
    const used = Number(countStr ?? 0);
    return {
      bucket,
      used,
      remaining: Math.max(0, max - used),
      limit: max,
      resetSec: ttl > 0 ? ttl : windowSec,
    };
  } catch {
    return { bucket, used: 0, remaining: max, limit: max, resetSec: windowSec };
  }
}
