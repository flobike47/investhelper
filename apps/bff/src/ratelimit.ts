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
  // Lecture publique d'un épisode partagé — compté par token de partage.
  // Un épisode de 8 min ≈ 15 chunks ; 200 laisse de la marge tout en
  // bornant la facture si un lien fuit.
  publicTts:     { max: 200, windowSec: 24 * 60 * 60 },
} as const;

export type QuotaBucket = keyof typeof QUOTAS;

export class QuotaExceeded extends Error {
  statusCode = 429;
  constructor(public bucket: QuotaBucket, public limit: number, public ttl: number) {
    super(`Quota dépassé pour ${bucket} (max ${limit}/24h). Réessaye dans ${Math.ceil(ttl / 60)} min.`);
  }
}

/**
 * `subject` = id de l'entité limitée (user.id, ou `share:<token>` pour les
 * routes publiques).
 *
 * Création de la clé avec TTL + incrément dans une seule transaction MULTI :
 * avec INCR puis EXPIRE séparés, un échec entre les deux laissait une clé
 * sans expiration → quota bloqué définitivement.
 */
export async function enforceQuota(subject: string, bucket: QuotaBucket): Promise<void> {
  const { max, windowSec } = QUOTAS[bucket];
  const key = `quota:${bucket}:${subject}`;

  try {
    const res = await redis
      .multi()
      .set(key, 0, 'EX', windowSec, 'NX')
      .incr(key)
      .ttl(key)
      .exec();
    if (!res) return; // transaction annulée — passthrough
    const count = Number(res[1]?.[1] ?? 0);
    let ttl = Number(res[2]?.[1] ?? -1);
    // Auto-réparation des clés restées sans TTL (créées par l'ancienne
    // implémentation INCR puis EXPIRE non atomique).
    if (ttl === -1) {
      await redis.expire(key, windowSec);
      ttl = windowSec;
    }
    if (count > max) {
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
