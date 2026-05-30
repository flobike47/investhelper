import type { FastifyInstance } from 'fastify';
import { cachedBinary, cachedJson, hashKey, TTL } from '../cache.js';
import { gemini } from '../providers/gemini.js';
import { newsapi } from '../providers/newsapi.js';
import { enforceQuota } from '../ratelimit.js';
import { requireUser } from '../auth.js';
import { BadRequest, clampArray, clampInt, validateString } from '../validation.js';

const WORDS_PER_MINUTE_FR = 160;

// Voix Gemini autorisées (préviendrait un user qui voudrait sonder l'API
// avec des noms de voix exotiques ou un grand nombre de speakers).
const ALLOWED_VOICES = new Set([
  'Charon', 'Kore', 'Aoede', 'Puck', 'Fenrir', 'Zephyr', 'Algieba',
  'Enceladus', 'Iapetus', 'Despina', 'Erinome', 'Orus', 'Schedar',
  'Sulafat', 'Vindemiatrix', 'Achernar', 'Achird', 'Algenib',
  'Autonoe', 'Callirrhoe', 'Gacrux', 'Laomedeia', 'Leda',
  'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager',
  'Umbriel', 'Zubenelgenubi',
]);
const MAX_SPEAKERS = 4;
const MAX_TTS_TEXT = 2000; // ~ 1 min d'audio max par chunk

const DEFAULT_SPEAKERS: Record<string, string> = { Alex: 'Charon', Sophie: 'Kore' };

interface ScriptBody {
  categories: string[];
  /**
   * Durée cible : nombre fixe en minutes (2-10), ou 'auto' pour laisser
   * le BFF calculer en fonction du volume de news disponibles.
   * Undefined = 'auto'.
   */
  targetMinutes?: number | 'auto';
}

const MAX_PODCAST_MINUTES = 10;

/** Calcule la durée cible (min) à partir du nombre total d'articles. */
function autoDurationMinutes(articleCount: number): number {
  // 0-10 articles → 2 min, 11-25 → 4 min, 26-40 → 6 min, 41+ → 8 min
  if (articleCount <= 10) return 2;
  if (articleCount <= 25) return 4;
  if (articleCount <= 40) return 6;
  return 8;
}

interface ScriptResult {
  script: string;
  sources: string[];
  durationEstimateSec: number;
}

interface TtsBody {
  text: string;
  speakers?: Record<string, string>;
}

function validateSpeakers(input: Record<string, string> | undefined): Record<string, string> {
  if (!input || Object.keys(input).length === 0) return DEFAULT_SPEAKERS;
  const entries = Object.entries(input);
  if (entries.length > MAX_SPEAKERS) {
    throw new BadRequest(`Trop de speakers (max ${MAX_SPEAKERS})`);
  }
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
    const manualMinutes = isAuto ? null : clampInt(rawTarget, 4, 1, MAX_PODCAST_MINUTES);

    // Le cache inclut la durée (ou 'auto' pour cache distinct par catégorie)
    const cacheKey = `podcast:script:${hashKey(
      JSON.stringify({
        categories: [...categories].sort(),
        duration: isAuto ? 'auto' : manualMinutes,
        day: new Date().toISOString().slice(0, 10),
      }),
    )}`;

    return cachedJson<ScriptResult>(cacheKey, TTL.podcastScript, async () => {
      await enforceQuota(user.id, 'podcastScript');
      const results = await Promise.all(
        categories.map(async (cat) => {
          try {
            const res = await newsapi.everything({ q: cat, language: 'fr', pageSize: 8 });
            return { category: cat, articles: res.articles };
          } catch {
            return { category: cat, articles: [] };
          }
        }),
      );
      const allArticles = results.flatMap((r) => r.articles);
      if (allArticles.length === 0) {
        throw new BadRequest("Aucun article trouvé pour les catégories choisies.");
      }
      // Décision finale de la durée maintenant qu'on a le compte d'articles
      const minutes = isAuto ? autoDurationMinutes(allArticles.length) : manualMinutes!;
      const sources = [...new Set(allArticles.map((a) => a.url))];
      const corpus = results
        .filter((r) => r.articles.length > 0)
        .map(
          (r) =>
            `## ${r.category}\n` +
            r.articles
              .slice(0, 6)
              .map(
                (a) =>
                  `- ${a.title}${a.description ? ` — ${a.description}` : ''} (source: ${a.source.name})`,
              )
              .join('\n'),
        )
        .join('\n\n');

      const script = await gemini.text(
        "Tu écris le script d'une émission de radio économique française quotidienne. " +
          "Deux animateurs en plateau : Alex (homme, ton posé, le 'cadre' qui resitue) " +
          "et Sophie (femme, ton dynamique, qui réagit, questionne, ajoute des précisions). " +
          "Ils dialoguent vraiment, se passent la parole, se relancent, marquent des accords " +
          "ou nuances. Style français parlé, vivant, sans être familier. Tu te bases " +
          "STRICTEMENT sur les news fournies — aucun chiffre, citation ou nom inventé. " +
          "Tu ne fais AUCUNE prédiction de prix ni recommandation d'achat / de vente.",
        `Voici les actualités du jour à couvrir, regroupées par thème :

${corpus}

Compose le script d'une émission de ~${minutes} minutes (~${minutes * WORDS_PER_MINUTE_FR} mots).

Format STRICT :
- Chaque réplique commence sur sa propre ligne par "Alex:" ou "Sophie:".
- N'utilise QUE ces deux noms.
- Aucun balisage, aucune indication scénique.
- Aucune liste, puce ou markdown — texte continu.
- Alternance fréquente : pas plus de 3-4 phrases d'affilée par animateur.
- Cite les sources quand pertinent.
- Rends UNIQUEMENT le script.`,
        { temperature: 0.5, maxOutputTokens: 4000 },
      );

      const wordCount = script.split(/\s+/).filter(Boolean).length;
      const durationEstimateSec = Math.round((wordCount / WORDS_PER_MINUTE_FR) * 60);
      return { script: script.trim(), sources, durationEstimateSec };
    });
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

    const key = `tts:${hashKey(JSON.stringify({ text, speakers }))}`;
    const audio = await cachedBinary(key, TTL.tts, async () => {
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
