import type { FastifyInstance } from 'fastify';
import { cachedJson, TTL } from '../cache.js';
import { newsapi } from '../providers/newsapi.js';
import { finnhub } from '../providers/finnhub.js';
import { clampInt, validateString, validateSymbol } from '../validation.js';

const MARKET_QUERY_FR =
  'bourse OR CAC40 OR Euronext OR action OR ETF OR investissement OR "marché financier" OR BCE OR Fed';

const ALLOWED_COUNTRIES = new Set([
  'fr', 'us', 'gb', 'de', 'it', 'es', 'be', 'ch', 'ca', 'nl',
]);

function safeCountry(c: string | undefined): string {
  const v = (c ?? 'fr').toLowerCase();
  return ALLOWED_COUNTRIES.has(v) ? v : 'fr';
}

export async function registerNewsRoutes(app: FastifyInstance) {
  app.get('/news/market', async () =>
    cachedJson('news:market', TTL.newsMarket, () =>
      newsapi.everything({ q: MARKET_QUERY_FR, language: 'fr', pageSize: 30 }),
    ),
  );

  app.get<{ Querystring: { country?: string } }>('/news/world', async (req) => {
    const country = safeCountry(req.query.country);
    return cachedJson(`news:world:${country}`, TTL.newsWorld, () =>
      newsapi.topHeadlines({ country, category: 'general', pageSize: 20 }),
    );
  });

  app.get<{ Querystring: { country?: string } }>('/news/business', async (req) => {
    const country = safeCountry(req.query.country);
    return cachedJson(`news:business:${country}`, TTL.newsBusiness, () =>
      newsapi.topHeadlines({ country, category: 'business', pageSize: 20 }),
    );
  });

  app.get<{ Params: { symbol: string }; Querystring: { days?: string } }>(
    '/news/company/:symbol',
    async (req) => {
      const s = validateSymbol(req.params.symbol);
      const days = clampInt(req.query.days, 14, 1, 90); // 1 jour à 90 jours max
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - days);
      const iso = (d: Date) => d.toISOString().slice(0, 10);

      return cachedJson(`news:company:${s}:${days}`, TTL.newsCompany, async () =>
        (await finnhub.companyNews(s, iso(from), iso(to))) ?? [],
      );
    },
  );

  // Endpoint de validation : utile pour tester un terme avant de l'ajouter en catégorie
  app.get<{ Querystring: { q?: string } }>('/news/search', async (req) => {
    const raw = (req.query.q ?? '').trim();
    if (!raw) return { articles: [] };
    const q = validateString(raw, 'q', 100, 1);
    return cachedJson(`news:search:${q.toLowerCase()}`, TTL.newsMarket, () =>
      newsapi.everything({ q, language: 'fr', pageSize: 10 }),
    );
  });
}
