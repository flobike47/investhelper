import { createClient, ApiError } from './http';
import type { RecommendationTrend, PriceTarget } from '@/types/finnhub';

/**
 * Financial Modeling Prep — used as a free-tier replacement for the
 * Finnhub endpoints that moved to premium (analyst recommendations,
 * price targets). 250 req/day on the free tier.
 *
 * The functions below adapt FMP responses to the same shape the rest of
 * the codebase already consumes from Finnhub, so scoring.ts doesn't need
 * to know which provider answered.
 */

const BASE_URL = 'https://financialmodelingprep.com/api';

let cachedKey: string | null = null;
let cachedClient: ReturnType<typeof createClient> | null = null;

export function setFmpKey(key: string | null) {
  cachedKey = key;
  cachedClient = null;
}

function getClient() {
  if (!cachedClient) cachedClient = createClient(BASE_URL, 'FMP');
  return cachedClient;
}

function requireKey(): string {
  const key = cachedKey || import.meta.env.VITE_FMP_API_KEY;
  if (!key) {
    throw new ApiError(
      'Clé Financial Modeling Prep manquante. Renseigne-la dans Réglages ou dans .env (VITE_FMP_API_KEY).',
      401,
      'FMP',
    );
  }
  return key;
}

async function tryGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  try {
    const apikey = requireKey();
    const res = await getClient().get<T>(path, { params: { ...params, apikey } });
    return res.data;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

interface FmpRecommendation {
  symbol: string;
  date: string;
  analystRatingsbuy?: number;
  analystRatingsBuy?: number;
  analystRatingsHold: number;
  analystRatingsSell: number;
  analystRatingsStrongBuy: number;
  analystRatingsStrongSell: number;
}

interface FmpPriceTargetConsensus {
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetConsensus: number;
  targetMedian: number;
}

export const fmp = {
  recommendations: async (symbol: string): Promise<RecommendationTrend[] | null> => {
    const data = await tryGet<FmpRecommendation[]>(
      `/v3/analyst-stock-recommendations/${encodeURIComponent(symbol)}`,
    );
    if (!data || data.length === 0) return null;
    return data.slice(0, 6).map((r) => ({
      symbol: r.symbol,
      period: r.date,
      buy: r.analystRatingsbuy ?? r.analystRatingsBuy ?? 0,
      hold: r.analystRatingsHold ?? 0,
      sell: r.analystRatingsSell ?? 0,
      strongBuy: r.analystRatingsStrongBuy ?? 0,
      strongSell: r.analystRatingsStrongSell ?? 0,
    }));
  },

  priceTarget: async (symbol: string): Promise<PriceTarget | null> => {
    const data = await tryGet<FmpPriceTargetConsensus[] | FmpPriceTargetConsensus>(
      `/v4/price-target-consensus`,
      { symbol },
    );
    if (!data) return null;
    const first = Array.isArray(data) ? data[0] : data;
    if (!first) return null;
    return {
      symbol: first.symbol ?? symbol,
      lastUpdated: '',
      targetHigh: first.targetHigh,
      targetLow: first.targetLow,
      targetMean: first.targetConsensus,
      targetMedian: first.targetMedian,
    };
  },
};
