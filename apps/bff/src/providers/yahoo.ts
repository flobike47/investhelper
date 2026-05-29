import axios from 'axios';
import { httpsAgent } from './http.js';
import { redis } from '../cache.js';
import type { RecommendationTrend, PriceTarget, EarningsEvent } from '../types.js';

/**
 * Client Yahoo Finance natif côté BFF — gère lui-même le flow
 * cookie + crumb que Yahoo exige depuis 2023.
 *
 * Endpoints utilisés :
 *   - https://fc.yahoo.com                          → récupère cookies A1/A3
 *   - /v1/test/getcrumb                              → récupère le crumb
 *   - /v10/finance/quoteSummary/{symbol}?modules=…   → données analystes & earnings
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
  });
  const setCookie = r1.headers['set-cookie'];
  if (!setCookie || setCookie.length === 0) {
    throw new Error('Yahoo : pas de cookie reçu de fc.yahoo.com');
  }
  const cookie = setCookie.map((c: string) => c.split(';')[0]).join('; ');

  const r2 = await axios.get('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': USER_AGENT, Cookie: cookie },
    httpsAgent,
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

export const yahoo = {
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
    return {
      symbol,
      lastUpdated: '',
      targetHigh: high ?? mean ?? 0,
      targetLow: low ?? mean ?? 0,
      targetMean: mean ?? median ?? 0,
      targetMedian: median ?? mean ?? 0,
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
