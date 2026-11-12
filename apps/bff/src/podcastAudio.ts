import { cachedBinary, TTL } from './cache.js';
import { gemini } from './providers/gemini.js';
import { enforceQuota } from './ratelimit.js';
import { DEFAULT_SPEAKERS, splitDialogue, ttsCacheKey } from './tts.js';

/**
 * Synthèse audio d'un épisode — partagée par POST /api/podcast/tts et par le
 * rappel quotidien qui prépare l'audio avant de notifier.
 */

/** Chunks synthétisés en parallèle : même valeur que le lecteur web. */
const TTS_CONCURRENCY = 4;

/** Un chunk, via le cache TTS (même clé que le lecteur) et le quota de l'utilisateur. */
export function synthesizeChunk(
  userId: string,
  text: string,
  speakers: Record<string, string>,
): Promise<Buffer> {
  return cachedBinary(ttsCacheKey(text, speakers), TTL.tts, async () => {
    await enforceQuota(userId, 'podcastTts');
    return gemini.ttsMultiSpeaker(text, speakers);
  });
}

/**
 * Remplit le cache TTS pour tout l'épisode, avec le découpage et les voix du
 * lecteur web : la lecture démarre ensuite sans attendre Gemini. Les chunks
 * déjà en cache ne sont pas re-synthétisés, donc relancer après un échec ne
 * refait que les manquants. Rejette avec la première erreur, une fois les
 * appels en cours terminés (aucun appel ne déborde sur une tentative suivante).
 */
export async function prepareEpisodeAudio(userId: string, script: string): Promise<void> {
  const chunks = splitDialogue(script);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < chunks.length) {
      const chunk = chunks[next++];
      try {
        await synthesizeChunk(userId, chunk, DEFAULT_SPEAKERS);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(TTS_CONCURRENCY, chunks.length) }, worker),
  );
  const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (rejected) throw rejected.reason;
}
