import type { FastifyInstance } from 'fastify';
import { cachedJson, TTL } from '../cache.js';
import { finnhub } from '../providers/finnhub.js';
import { twelvedata } from '../providers/twelvedata.js';
import { fmp } from '../providers/fmp.js';
import { yahoo } from '../providers/yahoo.js';
import { clampInt, validateEnum, validateString, validateSymbol } from '../validation.js';

export async function registerMarketRoutes(app: FastifyInstance) {
  app.get<{ Params: { symbol: string } }>('/quote/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    return cachedJson(`quote:${s}`, TTL.quote, () => finnhub.quote(s));
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
    const ttl = resolution === 'D' ? TTL.candlesDaily : TTL.candlesWeekly;
    return cachedJson(`candles:${s}:${resolution}:${lookbackDays}`, ttl, () =>
      twelvedata.candles(s, resolution, lookbackDays),
    );
  });

  app.get<{ Params: { symbol: string } }>('/recommendations/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    return cachedJson(`reco:${s}`, TTL.recommendations, async () => {
      return (
        (await yahoo.recommendations(s)) ??
        (await fmp.recommendations(s)) ??
        (await finnhub.recommendations(s))
      );
    });
  });

  app.get<{ Params: { symbol: string } }>('/price-target/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    return cachedJson(`target:${s}`, TTL.priceTarget, async () => {
      return (
        (await yahoo.priceTarget(s)) ??
        (await fmp.priceTarget(s)) ??
        (await finnhub.priceTarget(s))
      );
    });
  });

  app.get<{ Params: { symbol: string } }>('/earnings/:symbol', async (req) => {
    const s = validateSymbol(req.params.symbol);
    return cachedJson(`earnings:${s}`, TTL.earnings, async () => {
      const fromYahoo = await yahoo.nextEarnings(s);
      if (fromYahoo) return fromYahoo;

      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 7);
      const to = new Date(today);
      to.setDate(to.getDate() + 120);
      const iso = (d: Date) => d.toISOString().slice(0, 10);

      const res = await finnhub.earningsCalendar(s, iso(from), iso(to));
      if (!res) return null;
      const startOfToday = new Date(today.toDateString()).getTime();
      const upcoming = res.earningsCalendar
        .filter((e) => new Date(e.date).getTime() >= startOfToday - 86400_000)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return upcoming[0] ?? null;
    });
  });

  app.get<{ Querystring: { q: string } }>('/search', async (req) => {
    const raw = (req.query.q ?? '').trim();
    if (!raw) return { count: 0, result: [] };
    const q = validateString(raw, 'q', 50, 1);
    return cachedJson(`search:${q.toLowerCase()}`, TTL.search, () => finnhub.search(q));
  });
}
