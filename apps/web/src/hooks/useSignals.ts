import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { Horizon } from '@/constants/horizons';
import type { Money, Signal } from '@/types/signals';

/** Limite du BFF par appel à /api/signals : au-delà, la liste est découpée. */
export const MAX_SIGNALS_PER_CALL = 30;
/** Aligné sur le cache du cours côté BFF (60 s). */
const STALE_MS = 60_000;

/** État d'affichage d'un ticker dans une liste. */
export interface TickerView {
  symbol: string;
  loading: boolean;
  error: Error | null;
  currency: string | null;
  price: Money | null;
  changePct: number | null;
  score: number | null;
  signal: Signal;
  closes: number[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Signaux d'une liste de tickers, calculés par le BFF : une requête par lot
 * de 30 au lieu de 4 requêtes par ticker.
 */
export function useSignals(symbols: string[], horizon: Horizon): TickerView[] {
  const chunks = chunk(symbols, MAX_SIGNALS_PER_CALL);
  const queries = useQueries({
    queries: chunks.map((c) => ({
      queryKey: ['signals', horizon, c.join(',')],
      queryFn: () => api.signals(c, horizon),
      staleTime: STALE_MS,
    })),
  });

  return symbols.map((symbol, i) => {
    const q = queries[Math.floor(i / MAX_SIGNALS_PER_CALL)];
    const row = q?.data?.find((r) => r.symbol === symbol.toUpperCase()) ?? null;
    const rowError = row && row.errors.length > 0 ? new Error(row.errors.join(' · ')) : null;
    return {
      symbol,
      loading: q?.isLoading ?? true,
      error: (q?.error as Error | null) ?? rowError,
      currency: row?.currency ?? null,
      price: row?.price ?? null,
      changePct: row?.changePct ?? null,
      score: row?.score ?? null,
      signal: row?.signal ?? 'unknown',
      closes: row?.closes ?? [],
    };
  });
}

/** Fiche complète d'un actif (signal, plan, analogue, playbook). */
export function useSignal(symbol: string, horizon: Horizon) {
  return useQuery({
    queryKey: ['signal', symbol, horizon],
    queryFn: () => api.signal(symbol, horizon),
    enabled: !!symbol,
    staleTime: STALE_MS,
  });
}
