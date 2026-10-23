import type { FastifyInstance } from 'fastify';
import { cachedBinary, TTL } from '../cache.js';
import { MAX_TTS_TEXT, ttsCacheKey, validateSpeakers } from '../tts.js';
import { gemini } from '../providers/gemini.js';
import { generatePodcastScript, MAX_PODCAST_MINUTES } from '../podcastScript.js';
import { enforceQuota } from '../ratelimit.js';
import { requireUser } from '../auth.js';
import { BadRequest, clampArray, clampInt, validateString } from '../validation.js';

interface ScriptBody {
  categories: string[];
  /**
   * Durée cible : nombre fixe en minutes (2-10), ou 'auto' pour laisser
   * le BFF calculer en fonction du volume de news disponibles.
   * Undefined = 'auto'.
   */
  targetMinutes?: number | 'auto';
}

interface TtsBody {
  text: string;
  speakers?: unknown;
}

function validateCategories(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new BadRequest('categories[] requis');
  }
  const cats = clampArray(input, 20).map((c) => validateString(String(c), 'categorie', 60, 1));
  return cats;
}

export async function registerPodcastRoutes(app: FastifyInstance) {
  app.post<{ Body: ScriptBody }>('/podcast/script', async (req) => {
    const user = requireUser(req);
    const categories = validateCategories(req.body?.categories);

    // Mode 'auto' = on décide après avoir vu les news. Sinon on clamp la valeur.
    const rawTarget = req.body?.targetMinutes;
    const isAuto = rawTarget === undefined || rawTarget === 'auto';
    const target = isAuto ? 'auto' : clampInt(rawTarget, 4, 1, MAX_PODCAST_MINUTES);

    return generatePodcastScript(user.id, categories, target);
  });

  /**
   * TTS par chunk. Cache par hash de (texte + voix) → 30 jours.
   * - Texte borné à MAX_TTS_TEXT pour éviter qu'un user fasse un appel
   *   gigantesque qui draine la facture Gemini.
   * - Voix doivent être dans la whitelist Gemini.
   */
  app.post<{ Body: TtsBody }>('/podcast/tts', async (req, reply) => {
    const user = requireUser(req);
    const text = validateString(req.body?.text ?? '', 'text', MAX_TTS_TEXT, 1);
    const speakers = validateSpeakers(req.body?.speakers);

    const audio = await cachedBinary(ttsCacheKey(text, speakers), TTL.tts, async () => {
      await enforceQuota(user.id, 'podcastTts');
      return gemini.ttsMultiSpeaker(text, speakers);
    });
    reply
      .header('Content-Type', 'audio/L16; codec=pcm; rate=24000')
      .header('Cache-Control', 'private, max-age=2592000') // private : ne pas mettre en cache CDN public
      .header('X-Audio-Sample-Rate', '24000')
      .header('X-Audio-Channels', '1')
      .header('X-Audio-Bits', '16');
    return reply.send(audio);
  });
}
