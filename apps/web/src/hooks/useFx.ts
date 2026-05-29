import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

/**
 * Renvoie un mapping currency -> taux par rapport à 1 EUR.
 * Données fournies par le BFF (cache Redis 6h, source open.er-api.com).
 */
export function useFxRates() {
  return useQuery({
    queryKey: ['fx-rates-eur'],
    queryFn: () => api.fxRates(),
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
}
