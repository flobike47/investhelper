import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { HorizonConfig } from '@/constants/horizons';
import { analyzeTechnicals, combine, summarizeAnalysts, type CombinedScore } from '@/lib/scoring';

export function useQuote(symbol: string) {
  return useQuery({
    queryKey: ['quote', symbol],
    queryFn: () => api.quote(symbol),
    enabled: !!symbol,
  });
}

export function useProfile(symbol: string) {
  return useQuery({
    queryKey: ['profile', symbol],
    queryFn: () => api.profile(symbol),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60_000,
  });
}

export function useCandles(symbol: string, horizon: HorizonConfig) {
  return useQuery({
    queryKey: ['candles', symbol, horizon.candleResolution, horizon.lookbackDays],
    queryFn: () => api.candles(symbol, horizon.candleResolution, horizon.lookbackDays),
    enabled: !!symbol,
    staleTime: 60 * 60_000,
  });
}

export function useCompanyNews(symbol: string, days = 14) {
  return useQuery({
    queryKey: ['company-news', symbol, days],
    queryFn: () => api.companyNews(symbol, days),
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

/** Fetches everything needed to score a list of tickers in parallel.
 *  Toutes les fallback chains (Yahoo → FMP → Finnhub) sont maintenant
 *  gérées côté BFF — une seule requête par type, depuis le frontend. */
export function useAnalyzedTickers(symbols: string[], horizon: HorizonConfig): AnalyzedTicker[] {
  const quoteQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['quote', s],
      queryFn: () => api.quote(s),
      enabled: !!s,
    })),
  });
  const candleQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['candles', s, horizon.candleResolution, horizon.lookbackDays],
      queryFn: () => api.candles(s, horizon.candleResolution, horizon.lookbackDays),
      enabled: !!s,
      staleTime: 60 * 60_000,
    })),
  });
  const recoQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['reco', s],
      queryFn: () => api.recommendations(s),
      enabled: !!s,
      staleTime: 6 * 60 * 60_000,
    })),
  });
  const targetQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['price-target', s],
      queryFn: () => api.priceTarget(s),
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

    let score: CombinedScore | null = null;
    if (c.data) {
      const tech = analyzeTechnicals(c.data, horizon);
      const analyst = summarizeAnalysts(r.data ?? null, t.data ?? null);
      score = combine(tech, analyst, price);
    }

    return { symbol, loading, error, price, changePct, score };
  });
}
