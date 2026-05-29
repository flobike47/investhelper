import { useQueries, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { finnhub } from '@/services/finnhub';
import { twelvedata } from '@/services/twelvedata';
import { fmp } from '@/services/fmp';
import { yahoo } from '@/services/yahoo';
import type { HorizonConfig } from '@/constants/horizons';
import { analyzeTechnicals, combine, summarizeAnalysts, type CombinedScore } from '@/lib/scoring';

export function useQuote(symbol: string) {
  return useQuery({
    queryKey: ['quote', symbol],
    queryFn: () => finnhub.quote(symbol),
    enabled: !!symbol,
  });
}

export function useProfile(symbol: string) {
  return useQuery({
    queryKey: ['profile', symbol],
    queryFn: () => finnhub.profile(symbol),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60_000,
  });
}

export function useCandles(symbol: string, horizon: HorizonConfig) {
  return useQuery({
    queryKey: ['candles', symbol, horizon.candleResolution, horizon.lookbackDays],
    queryFn: () => twelvedata.candles(symbol, horizon.candleResolution, horizon.lookbackDays),
    enabled: !!symbol,
    staleTime: 60 * 60_000,
  });
}

export function useCompanyNews(symbol: string, days = 14) {
  const to = dayjs().format('YYYY-MM-DD');
  const from = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
  return useQuery({
    queryKey: ['company-news', symbol, from, to],
    queryFn: () => finnhub.companyNews(symbol, from, to),
    enabled: !!symbol,
    staleTime: 30 * 60_000,
  });
}

export interface AnalyzedTicker {
  symbol: string;
  loading: boolean;
  error: Error | null;
  price: number | null;
  changePct: number | null;
  score: CombinedScore | null;
}

/** Fetches everything needed to score a list of tickers in parallel. */
export function useAnalyzedTickers(symbols: string[], horizon: HorizonConfig): AnalyzedTicker[] {
  const quoteQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['quote', s],
      queryFn: () => finnhub.quote(s),
      enabled: !!s,
    })),
  });
  const candleQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['candles', s, horizon.candleResolution, horizon.lookbackDays],
      queryFn: () => twelvedata.candles(s, horizon.candleResolution, horizon.lookbackDays),
      enabled: !!s,
      staleTime: 60 * 60_000,
    })),
  });
  const recoQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['reco', s],
      queryFn: async () =>
        (await yahoo.recommendations(s)) ??
        (await fmp.recommendations(s)) ??
        (await finnhub.recommendations(s)),
      enabled: !!s,
      staleTime: 6 * 60 * 60_000,
    })),
  });
  const targetQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['price-target', s],
      queryFn: async () =>
        (await yahoo.priceTarget(s)) ??
        (await fmp.priceTarget(s)) ??
        (await finnhub.priceTarget(s)),
      enabled: !!s,
      staleTime: 6 * 60 * 60_000,
    })),
  });

  return symbols.map((symbol, i) => {
    const q = quoteQueries[i];
    const c = candleQueries[i];
    const r = recoQueries[i];
    const t = targetQueries[i];
    const loading = q.isLoading || c.isLoading || r.isLoading || t.isLoading;
    const error = (q.error ?? c.error ?? r.error ?? t.error) as Error | null;

    const price = q.data?.c ?? null;
    const changePct = q.data?.dp ?? null;

    // Score computes as soon as candles are available. Analyst data is
    // optional: if Finnhub returned 403, summarizeAnalysts handles null.
    let score: CombinedScore | null = null;
    if (c.data) {
      const tech = analyzeTechnicals(c.data, horizon);
      const analyst = summarizeAnalysts(r.data ?? null, t.data ?? null);
      score = combine(tech, analyst, price);
    }

    return { symbol, loading, error, price, changePct, score };
  });
}
