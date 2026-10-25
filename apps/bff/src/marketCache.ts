import type { FastifyBaseLogger } from 'fastify';
import { cachedJson, TTL } from './cache.js';
import * as marketData from './marketData.js';
import type { Resolution } from './candleBars.js';
import { finnhub } from './providers/finnhub.js';
import { fmp } from './providers/fmp.js';
import { fx } from './providers/fx.js';
import { yahoo } from './providers/yahoo.js';
import type { EarningsEvent, MarketCandle, MarketQuote, PriceTarget, RecommendationTrend } from './types.js';

/**
 * Accès aux données de marché mis en cache Redis, partagés par les routes
 * /api/* et le calcul des signaux : une même clé, un seul appel amont.
 */

export function cachedQuote(symbol: string, log?: FastifyBaseLogger): Promise<MarketQuote> {
  return cachedJson(`quote:v2:${symbol}`, TTL.quote, () => marketData.quote(symbol, log));
}

export function cachedCandles(
  symbol: string,
  resolution: Resolution,
  lookbackDays: number,
  log?: FastifyBaseLogger,
): Promise<MarketCandle> {
  const ttl = resolution === 'D' ? TTL.candlesDaily : TTL.candlesWeekly;
  // v2 : réponses enrichies de la devise et de la source (repli Yahoo hors US).
  return cachedJson(`candles:v2:${symbol}:${resolution}:${lookbackDays}`, ttl, () =>
    marketData.candles(symbol, resolution, lookbackDays, log),
  );
}

/** Consensus analystes : Yahoo → FMP → Finnhub. */
export function cachedRecommendations(symbol: string): Promise<RecommendationTrend[] | null> {
  return cachedJson(`reco:${symbol}`, TTL.recommendations, async () => {
    return (
      (await yahoo.recommendations(symbol)) ??
      (await fmp.recommendations(symbol)) ??
      (await finnhub.recommendations(symbol))
    );
  });
}

/** Objectifs de cours : Yahoo → FMP → Finnhub. */
export function cachedPriceTarget(symbol: string): Promise<PriceTarget | null> {
  // v2 : les anciennes entrées pouvaient contenir des objectifs à 0 inventés.
  return cachedJson(`target:v2:${symbol}`, TTL.priceTarget, async () => {
    return (
      (await yahoo.priceTarget(symbol)) ??
      (await fmp.priceTarget(symbol)) ??
      (await finnhub.priceTarget(symbol))
    );
  });
}

/** Prochaine publication de résultats : Yahoo, sinon calendrier Finnhub. */
export function cachedNextEarnings(symbol: string): Promise<EarningsEvent | null> {
  return cachedJson(`earnings:${symbol}`, TTL.earnings, async () => {
    const fromYahoo = await yahoo.nextEarnings(symbol);
    if (fromYahoo) return fromYahoo;

    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    const to = new Date(today);
    to.setDate(to.getDate() + 120);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const res = await finnhub.earningsCalendar(symbol, iso(from), iso(to));
    if (!res) return null;
    const startOfToday = new Date(today.toDateString()).getTime();
    const upcoming = res.earningsCalendar
      .filter((e) => new Date(e.date).getTime() >= startOfToday - 86400_000)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return upcoming[0] ?? null;
  });
}

/** Taux de change : combien d'unités de chaque devise pour 1 EUR. */
export function cachedFxRates(): Promise<Record<string, number>> {
  return cachedJson('fx:eur', TTL.fx, () => fx.ratesToEur());
}
