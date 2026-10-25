import type { FastifyInstance } from 'fastify';
import { cachedJson, TTL } from '../cache.js';
import { finnhub } from '../providers/finnhub.js';
import {
  cachedCandles,
  cachedNextEarnings,
  cachedPriceTarget,
  cachedQuote,
  cachedRecommendations,
} from '../marketCache.js';
import { clampInt, validateEnum, validateString, validateSymbol } from '../validation.js';

export async function registerMarketRoutes(app: FastifyInstance) {
  app.get<{ Params: { symbol: string } }>('/quote/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    return cachedQuote(s, req.log);
  });

  app.get<{ Params: { symbol: string } }>('/profile/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    return cachedJson(`profile:${s}`, 24 * 60 * 60, () => finnhub.profile(s));
  });

  app.get<{
    Params: { symbol: string };
    Querystring: { resolution?: string; lookbackDays?: string };
  }>('/candles/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    const resolution = validateEnum(req.query.resolution, ['D', 'W', 'M'] as const, 'D');
    const lookbackDays = clampInt(req.query.lookbackDays, 365, 30, 3650); // 1 mois → 10 ans
    return cachedCandles(s, resolution, lookbackDays, req.log);
  });

  app.get<{ Params: { symbol: string } }>('/recommendations/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    return cachedRecommendations(s);
  });

  app.get<{ Params: { symbol: string } }>('/price-target/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    return cachedPriceTarget(s);
  });

  app.get<{ Params: { symbol: string } }>('/earnings/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    return cachedNextEarnings(s);
  });

  app.get<{ Querystring: { q: string } }>('/search', async (req) => {
    const raw = (req.query.q ?? '').trim();
    if (!raw) return { count: 0, result: [] };
    const q = validateString(raw, 'q', 50, 1);
    return cachedJson(`search:${q.toLowerCase()}`, TTL.search, () => finnhub.search(q));
  });
}
