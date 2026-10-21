import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

// `enabled` : la page Actualités n'interroge que la rubrique affichée.

export function useMarketNews(enabled = true) {
  return useQuery({
    queryKey: ['market-news-fr'],
    queryFn: () => api.marketNews(),
    staleTime: 15 * 60_000,
    enabled,
  });
}

export function useWorldNews(country = 'fr', enabled = true) {
  return useQuery({
    queryKey: ['world-news', country],
    queryFn: () => api.worldNews(country),
    staleTime: 15 * 60_000,
    enabled,
  });
}

export function useBusinessNews(country = 'fr', enabled = true) {
  return useQuery({
    queryKey: ['business-news', country],
    queryFn: () => api.businessNews(country),
    staleTime: 15 * 60_000,
    enabled,
  });
}
