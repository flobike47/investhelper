import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export function useMarketNews() {
  return useQuery({
    queryKey: ['market-news-fr'],
    queryFn: () => api.marketNews(),
    staleTime: 15 * 60_000,
  });
}

export function useWorldNews(country = 'fr') {
  return useQuery({
    queryKey: ['world-news', country],
    queryFn: () => api.worldNews(country),
    staleTime: 15 * 60_000,
  });
}

export function useBusinessNews(country = 'fr') {
  return useQuery({
    queryKey: ['business-news', country],
    queryFn: () => api.businessNews(country),
    staleTime: 15 * 60_000,
  });
}
