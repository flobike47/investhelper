import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
import { cachedBinary, hashKey, TTL } from '../cache.js';
import { gemini } from '../providers/gemini.js';
import { BadRequest, validateString } from '../validation.js';

const TOKEN_LEN = 16;
const ALLOWED_VOICES = new Set([
  'Charon', 'Kore', 'Aoede', 'Puck', 'Fenrir', 'Zephyr', 'Algieba',
  'Enceladus', 'Iapetus', 'Despina', 'Erinome', 'Orus', 'Schedar',
  'Sulafat', 'Vindemiatrix',
]);
const MAX_TTS_TEXT = 2000;
const DEFAULT_SPEAKERS: Record<string, string> = { Alex: 'Charon', Sophie: 'Kore' };

function generateToken(): string {
  // base62 ~16 chars → ~95 bits d'entropie, non devinable
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(TOKEN_LEN);
  let out = '';
  for (let i = 0; i < TOKEN_LEN; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

interface TtsBody {
  text: string;
  speakers?: Record<string, string>;
}

/**
 * Routes publiques (pas d'auth Supabase) — sécurisées par le token de partage
 * qui est non-devinable. Toutes sous /public/.
 */
export async function registerShareRoutes(app: FastifyInstance) {
  // -------- Lecture publique d'un épisode partagé --------
  app.get<{ Params: { token: string } }>('/api/public/podcast/:token', async (req, reply) => {
    const token = req.params.token;
    if (!/^[A-Za-z0-9]{8,64}$/.test(token)) {
      reply.code(400);
      return { error: 'token invalide' };
    }

    // Récupère le partage + check expiration
    const { data: share, error: shareErr } = await supabaseAdmin
      .from('podcast_shares')
      .select('episode_id, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (shareErr) throw shareErr;
    if (!share) { reply.code(404); return { error: 'lien invalide ou révoqué' }; }
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      reply.code(410); return { error: 'lien expiré' };
    }

    // Récupère l'épisode
    const { data: ep, error: epErr } = await supabaseAdmin
      .from('podcast_episodes')
      .select('id, date, categories, script, sources, duration_estimate_sec, created_at')
      .eq('id', share.episode_id)
      .maybeSingle();
    if (epErr) throw epErr;
    if (!ep) { reply.code(404); return { error: 'épisode introuvable' }; }

    return {
      id: ep.id,
      date: ep.date,
      categories: ep.categories,
      script: ep.script,
      sources: ep.sources,
      durationEstimateSec: ep.duration_estimate_sec,
      createdAt: ep.created_at,
    };
  });

  // -------- TTS sur un épisode partagé (chunk par chunk, comme le mode owner) --------
  app.post<{ Params: { token: string }; Body: TtsBody }>(
    '/api/public/podcast/:token/tts',
    async (req, reply) => {
      const token = req.params.token;
      if (!/^[A-Za-z0-9]{8,64}$/.test(token)) {
        reply.code(400); return { error: 'token invalide' };
      }

      // Valide le partage avant tout (gating)
      const { data: share, error: shareErr } = await supabaseAdmin
        .from('podcast_shares')
        .select('episode_id, expires_at')
        .eq('token', token)
        .maybeSingle();
      if (shareErr) throw shareErr;
      if (!share) { reply.code(404); return { error: 'lien invalide ou révoqué' }; }
      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        reply.code(410); return { error: 'lien expiré' };
      }

      const text = validateString(req.body?.text ?? '', 'text', MAX_TTS_TEXT, 1);
      const speakers = validateSpeakers(req.body?.speakers);

      // Même clé de cache que le owner → si l'épisode a déjà été écouté
      // (par lui ou un autre partageur), c'est instant.
      const key = `tts:${hashKey(JSON.stringify({ text, speakers }))}`;
      const audio = await cachedBinary(key, TTL.tts, async () =>
        gemini.ttsMultiSpeaker(text, speakers),
      );
      reply
        .header('Content-Type', 'audio/L16; codec=pcm; rate=24000')
        .header('Cache-Control', 'public, max-age=2592000')
        .header('X-Audio-Sample-Rate', '24000');
      return reply.send(audio);
    },
  );

  // -------- Côté user authentifié : créer / lire / révoquer un partage --------
  app.get<{ Params: { id: string } }>('/api/user/podcast/episodes/:id/share', async (req) => {
    const user = req.user;
    if (!user) throw new BadRequest('Unauthorized');
    const { data, error } = await supabaseAdmin
      .from('podcast_shares')
      .select('token, created_at, expires_at')
      .eq('episode_id', req.params.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  });

  app.post<{ Params: { id: string } }>('/api/user/podcast/episodes/:id/share', async (req) => {
    const user = req.user;
    if (!user) throw new BadRequest('Unauthorized');

    // Vérifie que l'épisode appartient au user
    const { data: ep } = await supabaseAdmin
      .from('podcast_episodes')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!ep) throw new BadRequest('Épisode introuvable');

    // Idempotent : si un share existe déjà pour cet épisode, on le renvoie
    const { data: existing } = await supabaseAdmin
      .from('podcast_shares')
      .select('token, created_at, expires_at')
      .eq('episode_id', ep.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) return existing;

    const token = generateToken();
    const { data, error } = await supabaseAdmin
      .from('podcast_shares')
      .insert({ token, episode_id: ep.id, user_id: user.id })
      .select('token, created_at, expires_at')
      .single();
    if (error) throw error;
    return data;
  });

  app.delete<{ Params: { id: string } }>('/api/user/podcast/episodes/:id/share', async (req) => {
    const user = req.user;
    if (!user) throw new BadRequest('Unauthorized');
    const { error } = await supabaseAdmin
      .from('podcast_shares')
      .delete()
      .eq('episode_id', req.params.id)
      .eq('user_id', user.id);
    if (error) throw error;
    return { ok: true };
  });
}

function validateSpeakers(input: Record<string, string> | undefined): Record<string, string> {
  if (!input || Object.keys(input).length === 0) return DEFAULT_SPEAKERS;
  const entries = Object.entries(input);
  if (entries.length > 4) throw new BadRequest('Trop de speakers');
  const out: Record<string, string> = {};
  for (const [speaker, voice] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(speaker)) {
      throw new BadRequest(`Nom de speaker invalide : ${speaker}`);
    }
    if (!ALLOWED_VOICES.has(voice)) {
      throw new BadRequest(`Voix non supportée : ${voice}`);
    }
    out[speaker] = voice;
  }
  return out;
}
