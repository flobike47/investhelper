import { useQuery } from '@tanstack/react-query';
import { useCompanyNews } from './useStockData';
import { analyzeTickerNews, extractMarketThemes, type TickerSentiment, type MarketThemes } from '@/lib/newsAnalysis';
import { useMarketNews, useWorldNews } from './useNews';
import { ALL_SECTORS } from '@/constants/universe';

export function useTickerSentiment(symbol: string) {
  const news = useCompanyNews(symbol, 14);
  return useQuery<TickerSentiment>({
    queryKey: ['ticker-sentiment', symbol, news.data?.length ?? 0],
    queryFn: () => analyzeTickerNews(symbol, news.data ?? []),
    enabled: !!symbol && !news.isLoading && !news.isError,
    staleTime: 60 * 60_000, // 1h — limite la conso de tokens Mistral
  });
}

export function useMarketThemes() {
  const world = useWorldNews();
  const market = useMarketNews();
  const ready = !world.isLoading && !market.isLoading && (world.data || market.data);
  return useQuery<MarketThemes>({
    queryKey: [
      'market-themes',
      world.data?.articles.length ?? 0,
      market.data?.articles.length ?? 0,
    ],
    queryFn: () =>
      extractMarketThemes(
        world.data?.articles ?? [],
        market.data?.articles ?? [],
        ALL_SECTORS,
      ),
    enabled: !!ready,
    staleTime: 3 * 60 * 60_000,
  });
}
