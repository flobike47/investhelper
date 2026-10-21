import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
import { cachedBinary, TTL } from '../cache.js';
import { gemini } from '../providers/gemini.js';
import { enforceQuota } from '../ratelimit.js';
import { requireUser } from '../auth.js';
import { BadRequest, Gone, NotFound, validateUuid } from '../validation.js';
import { DEFAULT_SPEAKERS, splitDialogue, ttsCacheKey } from '../tts.js';

const TOKEN_LEN = 16;
const TOKEN_RE = /^[A-Za-z0-9]{8,64}$/;
const UNIQUE_VIOLATION = '23505';

function generateToken(): string {
  // base62 ~16 chars → ~95 bits d'entropie, non devinable
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(TOKEN_LEN);
  let out = '';
  for (let i = 0; i < TOKEN_LEN; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function validateToken(token: unknown): string {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new BadRequest('token invalide');
  return token;
}

interface SharedEpisode {
  id: string;
  date: string;
  categories: string[];
  script: string;
  sources: string[];
  duration_estimate_sec: number;
  created_at: string;
}

/** Résout un token de partage actif vers son épisode, ou lève 404/410. */
async function loadSharedEpisode(token: string): Promise<SharedEpisode> {
  const { data: share, error: shareErr } = await supabaseAdmin
    .from('podcast_shares')
    .select('episode_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (shareErr) throw shareErr;
  if (!share) throw new NotFound('lien invalide ou révoqué');
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    throw new Gone('lien expiré');
  }

  const { data: ep, error: epErr } = await supabaseAdmin
    .from('podcast_episodes')
    .select('id, date, categories, script, sources, duration_estimate_sec, created_at')
    .eq('id', share.episode_id)
    .maybeSingle();
  if (epErr) throw epErr;
  if (!ep) throw new NotFound('épisode introuvable');
  return ep as SharedEpisode;
}

const SHARE_COLUMNS = 'token, created_at, expires_at';

/**
 * Routes publiques (pas d'auth Supabase) — sécurisées par le token de partage
 * qui est non-devinable. Toutes sous /api/public/.
 */
export async function registerShareRoutes(app: FastifyInstance) {
  // -------- Lecture publique d'un épisode partagé --------
  app.get<{ Params: { token: string } }>('/api/public/podcast/:token', async (req) => {
    const ep = await loadSharedEpisode(validateToken(req.params.token));
    return {
      id: ep.id,
      date: ep.date,
      categories: ep.categories,
      script: ep.script,
      sources: ep.sources,
      durationEstimateSec: ep.duration_estimate_sec,
      createdAt: ep.created_at,
      // Nombre de chunks audio HD : le lecteur demande chaque index à
      // /tts — il ne choisit jamais le texte synthétisé.
      ttsChunkCount: splitDialogue(ep.script).length,
    };
  });

  // -------- TTS sur un épisode partagé --------
  // Le client envoie uniquement un index de chunk ; le texte est dérivé
  // côté serveur du script de l'épisode. Accepter un texte libre ici
  // transformait chaque lien de partage en proxy Gemini TTS gratuit.
  app.post<{ Params: { token: string }; Body: { chunkIndex?: unknown } }>(
    '/api/public/podcast/:token/tts',
    async (req, reply) => {
      const token = validateToken(req.params.token);
      const ep = await loadSharedEpisode(token);

      const chunks = splitDialogue(ep.script);
      const rawIndex = req.body?.chunkIndex;
      if (typeof rawIndex !== 'number' || !Number.isInteger(rawIndex)) {
        throw new BadRequest('chunkIndex requis (entier)');
      }
      if (rawIndex < 0 || rawIndex >= chunks.length) {
        throw new BadRequest(`chunkIndex hors bornes (0-${chunks.length - 1})`);
      }
      const text = chunks[rawIndex];
      const speakers = { ...DEFAULT_SPEAKERS };

      // Même clé de cache que le owner → si l'épisode a déjà été écouté,
      // c'est instantané et ne consomme pas de quota.
      const audio = await cachedBinary(ttsCacheKey(text, speakers), TTL.tts, async () => {
        await enforceQuota(`share:${token}`, 'publicTts');
        return gemini.ttsMultiSpeaker(text, speakers);
      });
      reply
        .header('Content-Type', 'audio/L16; codec=pcm; rate=24000')
        // private : le lien peut être révoqué, un cache partagé le servirait encore
        .header('Cache-Control', 'private, max-age=86400')
        .header('X-Audio-Sample-Rate', '24000');
      return reply.send(audio);
    },
  );

  // -------- Côté user authentifié : créer / lire / révoquer un partage --------
  app.get<{ Params: { id: string } }>('/api/user/podcast/episodes/:id/share', async (req) => {
    const user = requireUser(req);
    const episodeId = validateUuid(req.params.id);
    const { data, error } = await supabaseAdmin
      .from('podcast_shares')
      .select(SHARE_COLUMNS)
      .eq('episode_id', episodeId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  });

  app.post<{ Params: { id: string } }>('/api/user/podcast/episodes/:id/share', async (req) => {
    const user = requireUser(req);
    const episodeId = validateUuid(req.params.id);

    // Vérifie que l'épisode appartient au user
    const { data: ep, error: epErr } = await supabaseAdmin
      .from('podcast_episodes')
      .select('id')
      .eq('id', episodeId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (epErr) throw epErr;
    if (!ep) throw new NotFound('Épisode introuvable');

    const findExisting = async () => {
      const { data, error } = await supabaseAdmin
        .from('podcast_shares')
        .select(SHARE_COLUMNS)
        .eq('episode_id', ep.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    // Idempotent : si un share existe déjà pour cet épisode, on le renvoie
    const existing = await findExisting();
    if (existing) return existing;

    const { data, error } = await supabaseAdmin
      .from('podcast_shares')
      .insert({ token: generateToken(), episode_id: ep.id, user_id: user.id })
      .select(SHARE_COLUMNS)
      .single();
    if (error) {
      // Deux POST simultanés : l'index unique (migration 004) rejette le
      // second → on renvoie le partage créé par le premier.
      if (error.code === UNIQUE_VIOLATION) {
        const winner = await findExisting();
        if (winner) return winner;
      }
      throw error;
    }
    return data;
  });

  app.delete<{ Params: { id: string } }>('/api/user/podcast/episodes/:id/share', async (req) => {
    const user = requireUser(req);
    const episodeId = validateUuid(req.params.id);
    const { error } = await supabaseAdmin
      .from('podcast_shares')
      .delete()
      .eq('episode_id', episodeId)
      .eq('user_id', user.id);
    if (error) throw error;
    return { ok: true };
  });
}
