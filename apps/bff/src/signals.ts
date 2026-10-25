import type { FastifyBaseLogger } from 'fastify';
import {
  cachedCandles,
  cachedFxRates,
  cachedNextEarnings,
  cachedPriceTarget,
  cachedQuote,
  cachedRecommendations,
} from './marketCache.js';
import { convertToEur } from './finance/currency.js';
import { earningsInWindow, type EarningsWindow } from './finance/earnings.js';
import { HORIZONS, analogBarsFor, type Horizon } from './finance/horizons.js';
import { findRsiAnalog, pickBucketFromRsi, type HistoricalAnalog } from './finance/historicalAnalog.js';
import { buildPlaybook, type Playbook } from './finance/playbook.js';
import { analyzeTechnicals, combine, summarizeAnalysts, type Signal } from './finance/scoring.js';
import { buildTradeLevels } from './finance/tradePlan.js';
import { findInUniverse } from './universe.js';

/**
 * Calcul des signaux côté serveur : le web ne fait plus qu'afficher.
 * Les données de marché passent par les caches partagés (marketCache.ts) ;
 * le calcul lui-même est rapide et n'est pas mis en cache.
 */

/** Un montant dans la devise de cotation et en euros (null si le taux manque, jamais 1). */
export interface Money {
  native: number | null;
  eur: number | null;
}

export interface SignalDetail {
  symbol: string;
  /** Nom connu de l'univers de l'app ; null sinon. */
  name: string | null;
  horizon: Horizon;
  /** Devise de cotation (ISO). */
  currency: string;
  /** Unité d'une bougie de l'horizon, pour libeller l'analogue. */
  barUnit: 'séance' | 'semaine';
  price: Money;
  /** Variation du jour en %. */
  changePct: number | null;
  /** Horodatage du cours, en secondes. */
  quoteTime: number | null;
  /** Historique de l'horizon (devise native), pour le graphique. */
  chart: { t: number[]; c: number[] } | null;
  /** Score combiné −100..100 ; null sans historique de cours. */
  score: number | null;
  /** Signal combiné affiché ; 'unknown' sans historique de cours. */
  signal: Signal;
  technical: {
    signal: Signal;
    rsi: number | null;
    trend: 'up' | 'down' | 'flat' | 'unknown';
    rationale: string[];
  };
  analyst: {
    signal: Signal;
    buyRatio: number;
    totalAnalysts: number;
    period: string | null;
    targetMean: Money;
  };
  levels: {
    entry: Money;
    stop: Money;
    target: Money;
    riskReward: number | null;
    unfavorable: boolean;
    /** Faux en long terme : la sortie se fait sur thèse, pas sur un stop. */
    stopApplies: boolean;
  };
  analog: HistoricalAnalog | null;
  playbook: Playbook;
  /** Prochaine publication de résultats, située par rapport à la fenêtre de l'horizon. */
  earnings: EarningsWindow | null;
  /** Données partiellement indisponibles (cours ou historique), en clair. */
  errors: string[];
}

/** Ligne de liste (watchlist, idées) : le strict nécessaire à l'affichage. */
export interface SignalRow {
  symbol: string;
  name: string | null;
  currency: string | null;
  price: Money;
  changePct: number | null;
  score: number | null;
  signal: Signal;
  /** Clôtures de l'horizon pour la mini-courbe. */
  closes: number[];
  errors: string[];
}

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

export async function computeSignal(symbol: string, horizon: Horizon, log?: FastifyBaseLogger): Promise<SignalDetail> {
  const cfg = HORIZONS[horizon];
  const [quoteRes, candleRes, recoRes, targetRes, fxRes, earningsRes] = await Promise.allSettled([
    cachedQuote(symbol, log),
    cachedCandles(symbol, cfg.candleResolution, cfg.lookbackDays, log),
    cachedRecommendations(symbol),
    cachedPriceTarget(symbol),
    cachedFxRates(),
    cachedNextEarnings(symbol),
  ]);
  // Ni cours ni historique : rien à montrer, on remonte l'erreur de l'historique.
  if (quoteRes.status === 'rejected' && candleRes.status === 'rejected') throw candleRes.reason;

  const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : null;
  const candle = candleRes.status === 'fulfilled' ? candleRes.value : null;
  const reco = recoRes.status === 'fulfilled' ? recoRes.value : null;
  const target = targetRes.status === 'fulfilled' ? targetRes.value : null;
  const rates = fxRes.status === 'fulfilled' ? fxRes.value : null;
  const nextEarnings = earningsRes.status === 'fulfilled' ? earningsRes.value : null;

  const currency = quote?.currency ?? candle?.currency ?? 'USD';
  const eur = (v: number | null) => convertToEur(v, currency, rates);
  const money = (v: number | null): Money => ({ native: v, eur: eur(v) });

  const price = quote?.c ?? null;
  const technical = analyzeTechnicals(candle, cfg);
  const analyst = summarizeAnalysts(reco, target);
  const combined = candle ? combine(technical, analyst, price) : null;
  const signal = combined?.signal ?? 'unknown';

  const levels = buildTradeLevels({
    candle,
    signal,
    horizon: cfg,
    smaShort: technical.smaShort,
    targetMean: analyst.targetMean,
  });
  const analog = findRsiAnalog(candle, {
    rsiBucket: pickBucketFromRsi(technical.rsi),
    horizonBars: analogBarsFor(horizon),
    rsiPeriod: cfg.rsiPeriod,
  });
  const playbook = buildPlaybook({
    horizon,
    entry: eur(levels.entry),
    stop: eur(levels.stop),
    target: eur(levels.target),
    smaShort: eur(technical.smaShort),
    smaLong: eur(technical.smaLong),
  });

  const errors: string[] = [];
  if (quoteRes.status === 'rejected') errors.push(`Cours indisponible : ${message(quoteRes.reason)}`);
  if (candleRes.status === 'rejected') errors.push(`Historique indisponible : ${message(candleRes.reason)}`);

  return {
    symbol,
    name: findInUniverse(symbol)?.name ?? null,
    horizon,
    currency,
    barUnit: cfg.barUnit,
    price: money(price),
    changePct: quote?.dp ?? null,
    quoteTime: quote?.t ?? null,
    chart: candle && candle.s === 'ok' ? { t: candle.t, c: candle.c } : null,
    score: combined?.score ?? null,
    signal,
    technical: {
      signal: technical.signal,
      rsi: technical.rsi,
      trend: technical.trend,
      rationale: technical.rationale,
    },
    analyst: {
      signal: analyst.signal,
      buyRatio: analyst.buyRatio,
      totalAnalysts: analyst.totalAnalysts,
      period: analyst.period,
      targetMean: money(analyst.targetMean),
    },
    levels: {
      entry: money(levels.entry),
      stop: money(levels.stop),
      target: money(levels.target),
      riskReward: levels.riskReward,
      unfavorable: levels.unfavorable,
      stopApplies: cfg.atrStopMultiple !== null,
    },
    analog,
    playbook,
    earnings: earningsInWindow(nextEarnings, cfg, new Date()),
    errors,
  };
}

export function toRow(d: SignalDetail): SignalRow {
  return {
    symbol: d.symbol,
    name: d.name,
    currency: d.currency,
    price: d.price,
    changePct: d.changePct,
    score: d.score,
    signal: d.signal,
    closes: d.chart?.c ?? [],
    errors: d.errors,
  };
}

/** Parallélisme borné pour ne pas saturer les providers sur un lot de symboles. */
const BATCH_CONCURRENCY = 4;

export async function computeRows(symbols: string[], horizon: Horizon, log?: FastifyBaseLogger): Promise<SignalRow[]> {
  const rows: SignalRow[] = new Array(symbols.length);
  let next = 0;
  async function worker() {
    while (next < symbols.length) {
      const i = next++;
      const symbol = symbols[i];
      try {
        rows[i] = toRow(await computeSignal(symbol, horizon, log));
      } catch (err) {
        // Un symbole en échec ne fait pas échouer le lot.
        rows[i] = {
          symbol,
          name: findInUniverse(symbol)?.name ?? null,
          currency: null,
          price: { native: null, eur: null },
          changePct: null,
          score: null,
          signal: 'unknown',
          closes: [],
          errors: [message(err)],
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, symbols.length) }, worker));
  return rows;
}
