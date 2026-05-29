import { useQuery } from '@tanstack/react-query';
import { newsapi } from '@/services/newsapi';

const MARKET_QUERY_FR =
  'bourse OR CAC40 OR Euronext OR action OR ETF OR investissement OR "marché financier" OR BCE OR Fed';

export function useMarketNews() {
  return useQuery({
    queryKey: ['market-news-fr'],
    queryFn: () =>
      newsapi.everything({
        q: MARKET_QUERY_FR,
        language: 'fr',
        pageSize: 30,
      }),
    staleTime: 15 * 60_000,
  });
}

export function useWorldNews(country = 'fr') {
  return useQuery({
    queryKey: ['world-news', country],
    queryFn: () =>
      newsapi.topHeadlines({ country, category: 'general', pageSize: 20 }),
    staleTime: 15 * 60_000,
  });
}

export function useBusinessNews(country = 'fr') {
  return useQuery({
    queryKey: ['business-news', country],
    queryFn: () =>
      newsapi.topHeadlines({ country, category: 'business', pageSize: 20 }),
    staleTime: 15 * 60_000,
  });
}
