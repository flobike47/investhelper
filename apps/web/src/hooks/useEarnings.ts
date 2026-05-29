import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export function useNextEarnings(symbol: string) {
  return useQuery({
    queryKey: ['earnings', symbol],
    queryFn: () => api.nextEarnings(symbol),
    enabled: !!symbol,
    staleTime: 12 * 60 * 60_000,
  });
}
