import axios from 'axios';
import { DEFAULT_TIMEOUT_MS, httpsAgent, ProviderError } from './http.js';
import { redis } from '../cache.js';
import type { Resolution } from '../candleBars.js';
import { toYahooSymbol } from '../symbols.js';
import type { Candle, RecommendationTrend, PriceTarget, EarningsEvent } from '../types.js';

/**
 * Client Yahoo Finance natif côté BFF — gère lui-même le flow
 * cookie + crumb que Yahoo exige depuis 2023.
 *
 * Endpoints utilisés :
 *   - https://fc.yahoo.com                          → récupère cookies A1/A3
 *   - /v1/test/getcrumb                              → récupère le crumb
 *   - /v10/finance/quoteSummary/{symbol}?modules=…   → données analystes & earnings
 *   - /v8/finance/chart/{symbol}                     → cours et bougies (sans crumb), seule
 *     source gratuite pour les places hors US (Twelve Data les réserve au plan Grow)
 *
 * ANTI-RATE-LIMIT (Yahoo est non officiel et 429 facilement) :
 *  - Concurrence max 2 appels en parallèle (les autres queuent)
 *  - Cooldown global de 5 min sur 429 → on saute Yahoo et fallback sur FMP/Finnhub
 *  - Session cookie+crumb cachée 6h
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SESSION_TTL_MS = 6 * 60 * 60_000;          // 6 h
const COOLDOWN_KEY = 'yahoo:cooldown';
const COOLDOWN_SEC = 5 * 60;                      // 5 min après un 429
const MAX_CONCURRENT = 2;

// ---------- Concurrence limitée ---------------------------------------------
let active = 0;
const queue: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = queue.shift();
    if (next) next();
  }
}

// ---------- Cooldown global après 429 ---------------------------------------
async function isInCooldown(): Promise<boolean> {
  try { return Boolean(await redis.get(COOLDOWN_KEY)); }
  catch { return false; }
}

async function setCooldown(): Promise<void> {
  try { await redis.setex(COOLDOWN_KEY, COOLDOWN_SEC, '1'); }
  catch { /* swallow */ }
}

let cachedSession: { cookie: string; crumb: string } | null = null;
let cachedAt = 0;

async function getSession(force = false) {
  const now = Date.now();
  if (!force && cachedSession && now - cachedAt < SESSION_TTL_MS) return cachedSession;

  const r1 = await axios.get('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    maxRedirects: 0,
    validateStatus: () => true,
    httpsAgent,
    timeout: DEFAULT_TIMEOUT_MS,
  });
  const setCookie = r1.headers['set-cookie'];
  if (!setCookie || setCookie.length === 0) {
    throw new Error('Yahoo : pas de cookie reçu de fc.yahoo.com');
  }
  const cookie = setCookie.map((c: string) => c.split(';')[0]).join('; ');

  const r2 = await axios.get('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': USER_AGENT, Cookie: cookie },
    httpsAgent,
    timeout: DEFAULT_TIMEOUT_MS,
  });
  const crumb = String(r2.data).trim();
  if (!crumb) throw new Error('Yahoo : crumb vide');

  cachedSession = { cookie, crumb };
  cachedAt = now;
  return cachedSession;
}

interface YahooRaw { raw: number; fmt?: string }
interface YahooTrend {
  period: string;
  strongBuy: number; buy: number; hold: number; sell: number; strongSell: number;
}
interface YahooSummary {
  quoteSummary: {
    result: Array<{
      recommendationTrend?: { trend: YahooTrend[] };
      financialData?: {
        targetHighPrice?: YahooRaw;
        targetLowPrice?: YahooRaw;
        targetMeanPrice?: YahooRaw;
        targetMedianPrice?: YahooRaw;
      };
      calendarEvents?: {
        earnings?: {
          earningsDate?: YahooRaw[];
          earningsAverage?: YahooRaw;
          earningsHigh?: YahooRaw;
          earningsLow?: YahooRaw;
          revenueAverage?: YahooRaw;
        };
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

function num(v: YahooRaw | undefined | null): number | null {
  return v && typeof v.raw === 'number' && Number.isFinite(v.raw) ? v.raw : null;
}

async function quoteSummary(symbol: string, modules: string): Promise<YahooSummary | null> {
  // Si on est en cooldown global après un 429 récent, on saute direct.
  if (await isInCooldown()) return null;

  async function call(session: { cookie: string; crumb: string }) {
    return axios.get<YahooSummary>(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`,
      {
        headers: { 'User-Agent': USER_AGENT, Cookie: session.cookie, Accept: 'application/json' },
        params: { modules, crumb: session.crumb },
        validateStatus: () => true,
        httpsAgent,
        timeout: DEFAULT_TIMEOUT_MS,
      },
    );
  }

  try {
    return await limited(async () => {
      let session = await getSession();
      let res = await call(session);

      if (res.status === 401 || res.status === 403) {
        session = await getSession(true);
        res = await call(session);
      }
      if (res.status === 429) {
        // Yahoo nous rate-limit → on coupe Yahoo pour les 5 prochaines minutes
        await setCooldown();
        console.warn('[yahoo] 429 → cooldown 5 min activé');
        return null;
      }
      if (res.status === 404) return null;
      if (res.status >= 400) {
        throw new Error(`Yahoo HTTP ${res.status}`);
      }
      if (res.data.quoteSummary?.error) {
        throw new Error(res.data.quoteSummary.error.description);
      }
      return res.data;
    });
  } catch (e) {
    // Yahoo non officiel — on dégrade en silence pour ne pas casser le ranking
    console.warn('[yahoo] échec', symbol, (e as Error).message);
    return null;
  }
}

// ---------- Chart (cours + bougies) ------------------------------------------
interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        regularMarketTime?: number;
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

export interface YahooChart {
  candle: Candle;
  quote: { c: number; dp: number | null; t: number };
  /** Devise ISO des prix renvoyés (les sous-unités comme GBp sont converties). */
  currency: string;
}

const INTERVAL: Record<Resolution, string> = { D: '1d', W: '1wk', M: '1mo' };

/**
 * Constaté le 25/10/2026 : sans cookie, le User-Agent Chrome complet reçoit
 * souvent un 429 (filtre anti-robot) et l'en-tête `Accept: application/json`
 * un 400, alors qu'un User-Agent minimal passe. On n'envoie donc que celui-ci.
 */
const CHART_USER_AGENT = 'Mozilla/5.0';
/** Cooldown propre au chart : un 429 ici ne doit pas couper les données analystes. */
const CHART_COOLDOWN_KEY = 'yahoo:chart:cooldown';
const CHART_COOLDOWN_SEC = 60;
/** Jours calendaires couverts par une bougie, avec marge pour week-ends et fériés. */
const DAYS_PER_BAR: Record<Resolution, number> = { D: 1.6, W: 7.2, M: 31 };

/**
 * Sous-unités cotées par Yahoo (pence à Londres, cents à Johannesburg, agorot
 * à Tel-Aviv) : on renvoie l'unité principale, sinon un prix de 638 « GBP »
 * serait 100 fois trop élevé.
 */
const MINOR_UNITS: Record<string, { currency: string; divisor: number }> = {
  GBp: { currency: 'GBP', divisor: 100 },
  GBX: { currency: 'GBP', divisor: 100 },
  ZAc: { currency: 'ZAR', divisor: 100 },
  ILA: { currency: 'ILS', divisor: 100 },
};

async function chart(symbol: string, resolution: Resolution, bars: number): Promise<YahooChart | null> {
  let cooling = false;
  try {
    cooling = Boolean(await redis.get(CHART_COOLDOWN_KEY));
  } catch {
    /* Redis indisponible : on tente l'appel */
  }
  // Panne temporaire, pas une absence de donnée : on lève pour que rien de
  // vide ne soit mis en cache.
  if (cooling) throw new ProviderError('Yahoo : en pause après un 429', 503, 'Yahoo');

  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - Math.ceil(bars * DAYS_PER_BAR[resolution] + 7) * 86_400;

  let res;
  try {
    res = await limited(() =>
      axios.get<YahooChartResponse>(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}`,
        {
          headers: { 'User-Agent': CHART_USER_AGENT },
          params: { interval: INTERVAL[resolution], period1, period2 },
          validateStatus: () => true,
          httpsAgent,
          timeout: DEFAULT_TIMEOUT_MS,
        },
      ),
    );
  } catch (e) {
    throw new ProviderError(`Yahoo : ${(e as Error).message}`, 502, 'Yahoo');
  }

  if (res.status === 429) {
    try {
      await redis.setex(CHART_COOLDOWN_KEY, CHART_COOLDOWN_SEC, '1');
    } catch {
      /* swallow */
    }
    throw new ProviderError('Yahoo : trop de requêtes (429)', 503, 'Yahoo');
  }
  if (res.status === 404) return null;
  if (res.status >= 400) throw new ProviderError(`Yahoo HTTP ${res.status}`, 502, 'Yahoo');

  const result = res.data?.chart?.result?.[0];
  const price = result?.meta.regularMarketPrice;
  if (!result || typeof price !== 'number' || !(price > 0)) return null;

  const unit = MINOR_UNITS[result.meta.currency ?? ''];
  const currency = unit?.currency ?? result.meta.currency ?? 'USD';
  const div = unit?.divisor ?? 1;

  const q = result.indicators.quote[0] ?? {};
  const ts = result.timestamp ?? [];
  const candle: Candle = { c: [], h: [], l: [], o: [], t: [], v: [], s: 'ok' };
  for (let i = 0; i < ts.length; i++) {
    const [o, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    // Bougie vide (jour férié, suspension) : ignorée plutôt que comblée.
    if (o == null || h == null || l == null || c == null || !(c > 0)) continue;
    candle.o.push(o / div);
    candle.h.push(h / div);
    candle.l.push(l / div);
    candle.c.push(c / div);
    candle.v.push(q.volume?.[i] ?? 0); // volume non utilisé dans les calculs
    candle.t.push(ts[i]);
  }
  const start = Math.max(0, candle.c.length - bars);
  for (const k of ['c', 'h', 'l', 'o', 't', 'v'] as const) candle[k] = candle[k].slice(start);
  if (candle.c.length === 0) candle.s = 'no_data';

  return {
    candle,
    quote: {
      c: price / div,
      dp: typeof result.meta.regularMarketChangePercent === 'number' ? result.meta.regularMarketChangePercent : null,
      t: result.meta.regularMarketTime ?? period2,
    },
    currency,
  };
}

export const yahoo = {
  chart,

  recommendations: async (symbol: string): Promise<RecommendationTrend[] | null> => {
    const data = await quoteSummary(symbol, 'recommendationTrend');
    const trend = data?.quoteSummary.result?.[0]?.recommendationTrend?.trend;
    if (!trend || trend.length === 0) return null;
    return trend.map((t) => ({
      symbol,
      period: t.period,
      buy: t.buy ?? 0,
      hold: t.hold ?? 0,
      sell: t.sell ?? 0,
      strongBuy: t.strongBuy ?? 0,
      strongSell: t.strongSell ?? 0,
    }));
  },

  priceTarget: async (symbol: string): Promise<PriceTarget | null> => {
    const data = await quoteSummary(symbol, 'financialData');
    const fd = data?.quoteSummary.result?.[0]?.financialData;
    if (!fd) return null;
    const mean = num(fd.targetMeanPrice);
    const high = num(fd.targetHighPrice);
    const low = num(fd.targetLowPrice);
    const median = num(fd.targetMedianPrice);
    if (mean === null && high === null && low === null && median === null) return null;
    // Champ absent → null : un objectif à 0 serait affiché comme une vraie valeur.
    return {
      symbol,
      lastUpdated: '',
      targetHigh: high,
      targetLow: low,
      targetMean: mean ?? median,
      targetMedian: median ?? mean,
    };
  },

  nextEarnings: async (symbol: string): Promise<EarningsEvent | null> => {
    const data = await quoteSummary(symbol, 'calendarEvents');
    const earnings = data?.quoteSummary.result?.[0]?.calendarEvents?.earnings;
    const dates = earnings?.earningsDate;
    if (!dates || dates.length === 0) return null;
    const ts = num(dates[0]);
    if (ts === null) return null;
    const d = new Date(ts * 1000);
    return {
      symbol,
      date: d.toISOString().slice(0, 10),
      epsActual: null,
      epsEstimate: num(earnings?.earningsAverage ?? null),
      hour: '',
      quarter: 0,
      revenueActual: null,
      revenueEstimate: num(earnings?.revenueAverage ?? null),
      year: d.getUTCFullYear(),
    };
  },
};
