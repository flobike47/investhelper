import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

const FX_URL = 'https://open.er-api.com/v6/latest/EUR';

interface OpenErApiResponse {
  result: 'success' | 'error';
  base_code: string;
  rates: Record<string, number>;
  'error-type'?: string;
}

/**
 * Renvoie un mapping currency -> taux par rapport à 1 EUR.
 * Ex: { USD: 1.04, GBP: 0.83, CHF: 0.93, ... }
 *
 * Source : open.er-api.com (mise à jour quotidienne, gratuit, sans clé,
 * CORS public). 6h de stale time largement suffisant vu la fréquence des
 * updates.
 */
export function useFxRates() {
  return useQuery({
    queryKey: ['fx-rates-eur'],
    queryFn: async () => {
      const res = await axios.get<OpenErApiResponse>(FX_URL);
      if (res.data.result !== 'success') {
        throw new Error(res.data['error-type'] ?? 'Erreur de récupération des taux de change');
      }
      return res.data.rates;
    },
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
}
