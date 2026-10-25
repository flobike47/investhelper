import type { FastifyBaseLogger } from 'fastify';
import { finnhub } from './providers/finnhub.js';
import { twelvedata } from './providers/twelvedata.js';
import { yahoo } from './providers/yahoo.js';
import { ProviderError } from './providers/http.js';
import { barsFor, type Resolution } from './candleBars.js';
import { isUsListed } from './symbols.js';
import { HttpError, NotFound } from './validation.js';
import type { MarketCandle, MarketQuote } from './types.js';

/**
 * Cours et bougies, quelle que soit la place de cotation.
 *
 * - Valeurs US : Finnhub (cours) et Twelve Data (bougies), couverts par
 *   leurs plans gratuits.
 * - Hors US, ou provider US en échec (403, symbole réservé au plan payant,
 *   quota 429, symbole inconnu) : Yahoo chart, seule source gratuite pour
 *   Paris, Francfort, Londres…
 *
 * Chaque réponse indique sa `source` et sa `currency`.
 */

/** Une panne amont n'est pas une erreur du BFF : 502, jamais 500 ni le statut du provider. */
function upstreamDown(what: string, symbol: string, err: unknown): HttpError {
  return new HttpError(502, `${what} indisponible pour ${symbol} (${(err as Error).message})`);
}

async function yahooChart(symbol: string, resolution: Resolution, bars: number, what: string) {
  try {
    return await yahoo.chart(symbol, resolution, bars);
  } catch (err) {
    throw upstreamDown(what, symbol, err);
  }
}

export async function quote(symbol: string, log?: FastifyBaseLogger): Promise<MarketQuote> {
  if (isUsListed(symbol)) {
    try {
      const q = await finnhub.quote(symbol);
      // Finnhub répond 200 avec c = 0 pour un symbole qu'il ne connaît pas.
      if (Number.isFinite(q.c) && q.c > 0) {
        return { c: q.c, dp: Number.isFinite(q.dp) ? q.dp : null, t: q.t, currency: 'USD', source: 'finnhub' };
      }
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      log?.warn({ symbol, provider: err.provider, status: err.status }, 'cours : repli sur Yahoo');
    }
  }
  const y = await yahooChart(symbol, 'D', 5, 'Cours');
  if (!y) throw new NotFound(`Aucun cours disponible pour ${symbol}`);
  return { ...y.quote, currency: y.currency, source: 'yahoo' };
}

export async function candles(
  symbol: string,
  resolution: Resolution,
  lookbackDays: number,
  log?: FastifyBaseLogger,
): Promise<MarketCandle> {
  if (isUsListed(symbol)) {
    try {
      const c = await twelvedata.candles(symbol, resolution, lookbackDays);
      if (c.s === 'ok') return { ...c, currency: c.currency ?? 'USD', source: 'twelvedata' };
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      log?.warn({ symbol, provider: err.provider, status: err.status }, 'bougies : repli sur Yahoo');
    }
  }
  const y = await yahooChart(symbol, resolution, barsFor(resolution, lookbackDays), 'Historique');
  if (y) return { ...y.candle, currency: y.currency, source: 'yahoo' };
  // Aucune source n'a d'historique : réponse vide explicite (pas une erreur).
  return { c: [], h: [], l: [], o: [], t: [], v: [], s: 'no_data', currency: 'USD', source: 'yahoo' };
}
