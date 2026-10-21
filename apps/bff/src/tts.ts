import { hashKey } from './cache.js';
import { BadRequest } from './validation.js';

/**
 * Règles TTS partagées entre la route owner (/api/podcast/tts) et la route
 * publique de partage (/api/public/podcast/:token/tts). Source unique :
 * une allowlist dupliquée finit toujours par diverger.
 */

/** Les 30 voix prebuilt de Gemini TTS. */
export const ALLOWED_VOICES: ReadonlySet<string> = new Set([
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe',
  'Callirrhoe', 'Charon', 'Despina', 'Enceladus', 'Erinome', 'Fenrir', 'Gacrux',
  'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus', 'Pulcherrima', 'Puck',
  'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel',
  'Vindemiatrix', 'Zephyr', 'Zubenelgenubi',
]);

export const MAX_SPEAKERS = 4;
export const MAX_TTS_TEXT = 2000; // ~ 1 min d'audio max par chunk

/** Taille de chunk utilisée par le front (lib/audio.ts) — doit rester
 *  identique pour que owner et lecteurs publics partagent le cache TTS. */
export const TTS_CHUNK_CHARS = 800;

export const DEFAULT_SPEAKERS: Readonly<Record<string, string>> = { Alex: 'Charon', Sophie: 'Kore' };

export function validateSpeakers(input: unknown): Record<string, string> {
  if (input === undefined || input === null) return { ...DEFAULT_SPEAKERS };
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequest('speakers invalide');
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return { ...DEFAULT_SPEAKERS };
  if (entries.length > MAX_SPEAKERS) {
    throw new BadRequest(`Trop de speakers (max ${MAX_SPEAKERS})`);
  }
  const out: Record<string, string> = {};
  for (const [speaker, voice] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(speaker)) {
      throw new BadRequest(`Nom de speaker invalide : ${speaker}`);
    }
    if (typeof voice !== 'string' || !ALLOWED_VOICES.has(voice)) {
      throw new BadRequest(`Voix non supportée : ${String(voice)}`);
    }
    out[speaker] = voice;
  }
  return out;
}

/** Clé de cache TTS — même format pour owner et partage. */
export function ttsCacheKey(text: string, speakers: Record<string, string>): string {
  return `tts:${hashKey(JSON.stringify({ text, speakers }))}`;
}

/**
 * Découpe un script de dialogue en chunks bornés sans couper une réplique.
 * ⚠️ Copie conforme de `splitDialogue` côté web (apps/web/src/lib/audio.ts) :
 * les deux doivent produire exactement les mêmes chunks pour partager le cache.
 */
export function splitDialogue(script: string, maxCharsPerChunk = TTS_CHUNK_CHARS): string[] {
  const turns: string[] = [];
  let current = '';

  for (const rawLine of script.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(Alex|Sophie)\s*:/i.test(line)) {
      if (current) turns.push(current.trim());
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current) turns.push(current.trim());

  const chunks: string[] = [];
  let buffer = '';
  for (const t of turns) {
    if (buffer.length + t.length + 1 > maxCharsPerChunk && buffer) {
      chunks.push(buffer);
      buffer = t;
    } else {
      buffer = buffer ? `${buffer}\n${t}` : t;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}
