import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export function useProfile(symbol: string) {
  return useQuery({
    queryKey: ['profile', symbol],
    queryFn: () => api.profile(symbol),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60_000,
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
