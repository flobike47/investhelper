import { cachedJson, TTL } from './cache.js';
import { gemini } from './providers/gemini.js';
import { newsapi } from './providers/newsapi.js';
import { enforceQuota } from './ratelimit.js';
import { ALL_SECTORS } from './universe.js';

const MARKET_QUERY_FR =
  'bourse OR CAC40 OR Euronext OR action OR ETF OR investissement OR "marché financier" OR BCE OR Fed';

export interface MarketThemes {
  themes: Array<{
    name: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    sectors: string[];
    summary: string;
  }>;
}

/**
 * Thèmes dominants de l'actualité (Gemini), associés aux secteurs de
 * l'univers. Cache 3 h partagé par tous ; le quota de l'utilisateur n'est
 * décompté que sur un cache vide. Par défaut, tous les secteurs de l'univers :
 * la route /analysis/themes et /ideas partagent alors la même clé.
 */
export function getMarketThemes(userId: string, sectors: readonly string[] = ALL_SECTORS): Promise<MarketThemes> {
  const cacheKey = `themes:${[...sectors].sort().join(',') || 'default'}`;
  return cachedJson<MarketThemes>(cacheKey, TTL.themes, async () => {
    await enforceQuota(userId, 'themes');
    const [world, market] = await Promise.all([
      newsapi.topHeadlines({ country: 'fr', category: 'general', pageSize: 20 }),
      newsapi.everything({ q: MARKET_QUERY_FR, language: 'fr', pageSize: 30 }),
    ]);
    const corpus = [
      ...world.articles.slice(0, 30).map((a) => `[monde] ${a.title}`),
      ...market.articles.slice(0, 30).map((a) => `[finance] ${a.title}`),
    ].join('\n');

    // Garde-fou : si on n'a pas pu extraire de corpus (NewsAPI down ou
    // quota), on retourne thèmes vides sans appeler Gemini.
    if (corpus.length === 0) return { themes: [] };

    return gemini.json<MarketThemes>(
      "Tu es un analyste macro. Tu identifies les thèmes dominants dans l'actualité du jour " +
        "et tu juges leur direction (bullish/bearish pour les marchés actions exposés). " +
        "Tu rends UNIQUEMENT un JSON valide. Aucune prédiction de prix chiffrée.",
      `Voici des titres d'actualité récents (mélange monde + finance) :

${corpus}

Identifie 3 à 5 thèmes dominants. Pour chacun, choisis les secteurs concernés UNIQUEMENT parmi cette liste :
${sectors.join(', ')}

Réponds avec ce schéma exact :
{
  "themes": [
    {
      "name": "Nom court du thème en français",
      "direction": "bullish" | "bearish" | "neutral",
      "sectors": ["choisis parmi la liste fournie"],
      "summary": "1 phrase en français qui explique le thème"
    }
  ]
}`,
      { temperature: 0.2 },
    );
  });
}
