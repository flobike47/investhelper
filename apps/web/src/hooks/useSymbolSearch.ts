import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/services/api';
import { useDebouncedValue } from './useDebouncedValue';

/** Délai de frappe avant d'interroger Finnhub (limité à 60 req/min). */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Recherche de symboles, debouncée. Chaque saisie a sa propre clé de cache :
 * une réponse lente pour « AP » ne peut pas écraser celle de « APPL », TanStack
 * Query n'expose que les données de la clé courante, et la requête obsolète
 * est annulée côté HTTP via l'AbortSignal.
 */
export function useSymbolSearch(rawQuery: string) {
  const q = useDebouncedValue(rawQuery.trim(), SEARCH_DEBOUNCE_MS);

  const query = useQuery({
    queryKey: ['symbol-search', q],
    // Le signal annule la requête HTTP devenue obsolète (saisie modifiée).
    queryFn: ({ signal }) => api.search(q, signal),
    enabled: q.length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    // Pas de nouvelle tentative sur 4xx (429 Finnhub notamment)
    retry: (count, err) => err instanceof ApiError && (err.status ?? 0) >= 500 && count < 1,
  });

  return {
    /** Résultats de la dernière recherche (vide si la saisie est vide). */
    results: rawQuery.trim() && q ? (query.data?.result ?? []) : [],
    searching: query.isFetching,
    error: query.error,
  };
}
