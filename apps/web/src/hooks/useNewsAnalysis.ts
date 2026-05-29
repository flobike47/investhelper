import { useQuery } from '@tanstack/react-query';
import { api, type TickerSentiment, type MarketThemes } from '@/services/api';
import { ALL_SECTORS } from '@/constants/universe';

export function useTickerSentiment(symbol: string) {
  return useQuery<TickerSentiment>({
    queryKey: ['ticker-sentiment', symbol],
    queryFn: () => api.tickerSentiment(symbol),
    enabled: !!symbol,
    staleTime: 6 * 60 * 60_000, // miroir du TTL Redis côté BFF
  });
}

export function useMarketThemes() {
  return useQuery<MarketThemes>({
    queryKey: ['market-themes'],
    queryFn: () => api.marketThemes(ALL_SECTORS),
    staleTime: 3 * 60 * 60_000,
  });
}
