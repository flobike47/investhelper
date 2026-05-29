import type { FastifyInstance } from 'fastify';
import { cachedJson, TTL } from '../cache.js';
import { gemini } from '../providers/gemini.js';
import { newsapi } from '../providers/newsapi.js';
import { finnhub } from '../providers/finnhub.js';
import { enforceQuota } from '../ratelimit.js';
import { requireUser } from '../auth.js';
import { clampArray, validateString, validateSymbol } from '../validation.js';

const MARKET_QUERY_FR =
  'bourse OR CAC40 OR Euronext OR action OR ETF OR investissement OR "marché financier" OR BCE OR Fed';

interface TickerSentiment {
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  score: number;
  drivers: string[];
  summary: string;
}

interface MarketThemes {
  themes: Array<{
    name: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    sectors: string[];
    summary: string;
  }>;
}

export async function registerAnalysisRoutes(app: FastifyInstance) {
  app.get<{ Params: { symbol: string } }>('/analysis/sentiment/:symbol', async (req) => {
    const user = requireUser(req);
    const s = validateSymbol(req.params.symbol);
    return cachedJson<TickerSentiment>(`sentiment:${s}`, TTL.sentiment, async () => {
      await enforceQuota(user.id, 'sentiment');
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 14);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const news = (await finnhub.companyNews(s, iso(from), iso(to))) ?? [];

      if (news.length === 0) {
        return {
          sentiment: 'neutral',
          score: 0,
          drivers: [],
          summary: 'Aucune actualité récente disponible.',
        };
      }
      const headlines = news.slice(0, 20).map((n, i) => `${i + 1}. ${n.headline}`).join('\n');
      return gemini.json<TickerSentiment>(
        "Tu es un analyste financier rigoureux. Tu rends UNIQUEMENT un objet JSON valide, " +
          "sans markdown, sans préambule. Tu ne fais aucune prédiction de prix chiffrée et tu " +
          "ne donnes aucun conseil d'achat ou de vente. Tu décris ce que disent les news, point.",
        `Analyse l'actualité récente de l'action ${s}.

Titres (les plus récents en premier) :
${headlines}

Réponds avec ce schéma exact :
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "score": number entre -1 et 1,
  "drivers": ["2 à 4 mots-clés courts qui expliquent le sentiment"],
  "summary": "1 à 2 phrases en français, factuelles, sans prédiction de prix"
}`,
        { temperature: 0.1 },
      );
    });
  });

  app.get<{ Querystring: { sectors?: string } }>('/analysis/themes', async (req) => {
    const user = requireUser(req);
    // Bornage: 50 secteurs max, 30 caractères max par secteur, alphanumérique-only
    const sectors = clampArray(
      (req.query.sectors ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 30 && /^[a-z0-9_]+$/i.test(s)),
      50,
    );
    const cacheKey = `themes:${[...sectors].sort().join(',') || 'default'}`;

    return cachedJson<MarketThemes>(cacheKey, TTL.themes, async () => {
      await enforceQuota(user.id, 'themes');
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
  });
}

// Helpers pour mémoire — utilisés par podcast.ts via re-export potentiel
export { validateString };
