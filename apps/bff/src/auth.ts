import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from './providers/supabaseAdmin.js';
import { redis } from './cache.js';

export interface AuthUser {
  id: string;
  email?: string;
  role: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

const AUTH_CACHE_TTL = 5 * 60; // 5 min — le token tourne ~ toutes les heures côté Supabase

/**
 * Vérification du JWT Supabase via `supabase.auth.getUser(token)`.
 * - Marche aussi bien pour les anciens projets en HS256 (legacy JWT secret)
 *   que pour les nouveaux projets en ES256 (JWT signing keys).
 * - Pas besoin de SUPABASE_JWT_SECRET côté BFF.
 * - Résultat caché 5 min dans Redis (clé = sha1(token)) pour éviter
 *   un round-trip Supabase à chaque requête API.
 */
export function registerAuth(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    // Routes protégées : /api/* sauf /api/public/* (accessibles via token
    // de partage, pas de Supabase JWT requis).
    if (!req.url.startsWith('/api/')) return;
    if (req.url.startsWith('/api/public/')) return;

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing bearer token' });
      return reply;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      reply.code(401).send({ error: 'Empty bearer token' });
      return reply;
    }

    const cacheKey = `auth:${sha1(token)}`;

    // 1. Cache hit ?
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        req.user = JSON.parse(cached) as AuthUser;
        return;
      }
    } catch {
      // Redis down — on passe au lookup direct sans crash
    }

    // 2. Vérification auprès de Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      req.log.warn(
        { err: error?.message, code: error?.code, status: error?.status },
        'supabase.auth.getUser rejected token',
      );
      reply.code(401).send({ error: 'Invalid token' });
      return reply;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role ?? 'authenticated',
    };

    // 3. Cache
    try {
      await redis.setex(cacheKey, AUTH_CACHE_TTL, JSON.stringify(req.user));
    } catch {
      /* swallow */
    }
  });
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) {
    const err = new Error('Unauthorized') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  return req.user;
}

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}
