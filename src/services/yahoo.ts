import axios from 'axios';
import { ApiError } from './http';
import type { RecommendationTrend, PriceTarget, EarningsEvent } from '@/types/finnhub';

/**
 * Client pour le Cloudflare Worker `yahoo-proxy` (voir worker/yahoo-proxy/).
 * Le Worker gère le flow cookie+crumb Yahoo et renvoie la réponse brute du
 * `/v10/finance/quoteSummary` — qu'on adapte ici aux shapes Finnhub déjà
 * utilisés par le scoring, pour ne pas avoir à toucher scoring.ts.
 */

let cachedUrl: string | null = null;
let cachedSecret: string | null = null;

export function setYahooProxy(url: string | null, secret: string | null) {
  cachedUrl = url?.replace(/\/+$/, '') || null;
  cachedSecret = secret || null;
}

interface YahooRawNumber {
  raw: number;
  fmt?: string;
}

interface YahooRecommendationTrend {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

interface YahooQuoteSummary {
  quoteSummary: {
    result:
      | Array<{
          recommendationTrend?: { trend: YahooRecommendationTrend[] };
          financialData?: {
            targetHighPrice?: YahooRawNumber;
            targetLowPrice?: YahooRawNumber;
            targetMeanPrice?: YahooRawNumber;
            targetMedianPrice?: YahooRawNumber;
            recommendationMean?: YahooRawNumber;
            numberOfAnalystOpinions?: YahooRawNumber;
          };
          calendarEvents?: {
            earnings?: {
              earningsDate?: YahooRawNumber[];
              earningsAverage?: YahooRawNumber;
              earningsHigh?: YahooRawNumber;
              earningsLow?: YahooRawNumber;
              revenueAverage?: YahooRawNumber;
            };
          };
        }>
      | null;
    error: { code: string; description: string } | null;
  };
}

function num(v: YahooRawNumber | undefined | null): number | null {
  return v && typeof v.raw === 'number' && Number.isFinite(v.raw) ? v.raw : null;
}

async function fetchSummary(symbol: string, modules: string): Promise<YahooQuoteSummary | null> {
  if (!cachedUrl) return null; // proxy non configuré → on dégrade silencieusement
  try {
    const res = await axios.get<YahooQuoteSummary>(
      `${cachedUrl}/quoteSummary/${encodeURIComponent(symbol)}`,
      {
        params: { modules },
        headers: cachedSecret ? { Authorization: `Bearer ${cachedSecret}` } : undefined,
        timeout: 0,
      },
    );
    if (res.data.quoteSummary?.error) {
      throw new ApiError(
        res.data.quoteSummary.error.description || 'Erreur Yahoo',
        502,
        'Yahoo',
      );
    }
    return res.data;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      // Sur erreur réseau ou 401/403/404 on dégrade — l'app a des fallbacks
      if (e.response && (e.response.status === 401 || e.response.status === 403 || e.response.status === 404)) {
        return null;
      }
    }
    throw e;
  }
}

export const yahoo = {
  recommendations: async (symbol: string): Promise<RecommendationTrend[] | null> => {
    const data = await fetchSummary(symbol, 'recommendationTrend');
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
    const data = await fetchSummary(symbol, 'financialData');
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
    const data = await fetchSummary(symbol, 'calendarEvents');
    const earnings = data?.quoteSummary.result?.[0]?.calendarEvents?.earnings;
    const dates = earnings?.earningsDate;
    if (!dates || dates.length === 0) return null;
    const first = dates[0];
    const ts = num(first);
    if (ts === null) return null;
    const date = new Date(ts * 1000);
    return {
      symbol,
      date: date.toISOString().slice(0, 10),
      epsActual: null,
      epsEstimate: num(earnings?.earningsAverage ?? null),
      hour: '',
      quarter: 0,
      revenueActual: null,
      revenueEstimate: num(earnings?.revenueAverage ?? null),
      year: date.getUTCFullYear(),
    };
  },
};
