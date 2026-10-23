import { cachedJson, hashKey, TTL } from './cache.js';
import { gemini } from './providers/gemini.js';
import { newsapi } from './providers/newsapi.js';
import { enforceQuota } from './ratelimit.js';
import { BadRequest } from './validation.js';

/**
 * Génération du script de podcast — partagée par la route
 * POST /api/podcast/script (bouton « Générer ») et par le rappel quotidien
 * (jobs/podcastReminder.ts) qui prépare l'épisode avant de notifier.
 */

const WORDS_PER_MINUTE_FR = 160;
export const MAX_PODCAST_MINUTES = 10;

/** Durée cible : nombre fixe en minutes, ou 'auto' (selon le volume de news). */
export type PodcastTarget = number | 'auto';

export interface ScriptResult {
  script: string;
  sources: string[];
  durationEstimateSec: number;
}

/** Calcule la durée cible (min) à partir du nombre total d'articles. */
export function autoDurationMinutes(articleCount: number): number {
  // 0-10 articles → 2 min, 11-25 → 4 min, 26-40 → 6 min, 41+ → 8 min
  if (articleCount <= 10) return 2;
  if (articleCount <= 25) return 4;
  if (articleCount <= 40) return 6;
  return 8;
}

/**
 * `categories` et `target` doivent être déjà validés par l'appelant.
 * Le quota `podcastScript` de `userId` n'est consommé que sur cache miss.
 */
export async function generatePodcastScript(
  userId: string,
  categories: string[],
  target: PodcastTarget,
): Promise<ScriptResult> {
  const isAuto = target === 'auto';

  // Le cache inclut la durée (ou 'auto' pour cache distinct par catégorie)
  const cacheKey = `podcast:script:${hashKey(
    JSON.stringify({
      categories: [...categories].sort(),
      duration: target,
      day: new Date().toISOString().slice(0, 10),
    }),
  )}`;

  return cachedJson<ScriptResult>(cacheKey, TTL.podcastScript, async () => {
    await enforceQuota(userId, 'podcastScript');
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
    const minutes = isAuto ? autoDurationMinutes(allArticles.length) : target;
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
      {
        temperature: 0.5,
        maxOutputTokens: 8000, // 8 min ≈ 1300 mots ≈ 1700-2200 tokens, marge x3
        thinkingBudget: 0,    // génération créative, pas de raisonnement nécessaire
      },
    );

    const wordCount = script.split(/\s+/).filter(Boolean).length;
    const durationEstimateSec = Math.round((wordCount / WORDS_PER_MINUTE_FR) * 60);
    return { script: script.trim(), sources, durationEstimateSec };
  });
}
