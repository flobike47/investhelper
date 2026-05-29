import { config } from '../config.js';
import { createProviderClient, safe } from './http.js';
import type { RecommendationTrend, PriceTarget } from '../types.js';

const client = createProviderClient('https://financialmodelingprep.com/api', 'FMP');

function key() {
  // Pas de throw : si la clé manque, on renvoie null partout, le caller fallback
  return config.fmpKey;
}

interface FmpReco {
  symbol: string;
  date: string;
  analystRatingsbuy?: number;
  analystRatingsBuy?: number;
  analystRatingsHold: number;
  analystRatingsSell: number;
  analystRatingsStrongBuy: number;
  analystRatingsStrongSell: number;
}

interface FmpTarget {
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetConsensus: number;
  targetMedian: number;
}

export const fmp = {
  recommendations: async (symbol: string): Promise<RecommendationTrend[] | null> => {
    const apikey = key();
    if (!apikey) return null;
    return safe(async () => {
      const res = await client.get<FmpReco[]>(
        `/v3/analyst-stock-recommendations/${encodeURIComponent(symbol)}`,
        { params: { apikey } },
      );
      const data = res.data;
      if (!data || data.length === 0) throw new Error('Empty');
      return data.slice(0, 6).map((r) => ({
        symbol: r.symbol,
        period: r.date,
        buy: r.analystRatingsbuy ?? r.analystRatingsBuy ?? 0,
        hold: r.analystRatingsHold ?? 0,
        sell: r.analystRatingsSell ?? 0,
        strongBuy: r.analystRatingsStrongBuy ?? 0,
        strongSell: r.analystRatingsStrongSell ?? 0,
      }));
    });
  },

  priceTarget: async (symbol: string): Promise<PriceTarget | null> => {
    const apikey = key();
    if (!apikey) return null;
    return safe(async () => {
      const res = await client.get<FmpTarget[] | FmpTarget>('/v4/price-target-consensus', {
        params: { symbol, apikey },
      });
      const first = Array.isArray(res.data) ? res.data[0] : res.data;
      if (!first) throw new Error('Empty');
      return {
        symbol: first.symbol ?? symbol,
        lastUpdated: '',
        targetHigh: first.targetHigh,
        targetLow: first.targetLow,
        targetMean: first.targetConsensus,
        targetMedian: first.targetMedian,
      };
    });
  },
};
