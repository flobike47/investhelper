import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { api } from '@/services/api';
import { useAuth } from '@/lib/auth';

const KEY = ['watchlist'];

/**
 * Drop-in remplacement de l'ancien `useWatchlist` Zustand :
 *  `{ tickers, add, remove, reset }`
 *
 * "reset" est volontairement absent : pas de notion de "watchlist par défaut"
 * côté serveur. L'utilisateur démarre vide et ajoute ses tickers.
 */
export function useWatchlist() {
  const { user } = useAuth();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => api.getWatchlist().then((r) => r.tickers),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const addMut = useMutation({
    mutationFn: (ticker: string) => api.addToWatchlist(ticker),
    onMutate: async (ticker) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<string[]>(KEY) ?? [];
      const next = prev.includes(ticker.toUpperCase()) ? prev : [...prev, ticker.toUpperCase()];
      qc.setQueryData(KEY, next);
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      message.error((e as Error).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const removeMut = useMutation({
    mutationFn: (ticker: string) => api.removeFromWatchlist(ticker),
    onMutate: async (ticker) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<string[]>(KEY) ?? [];
      qc.setQueryData(KEY, prev.filter((t) => t !== ticker));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      message.error((e as Error).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    tickers: query.data ?? [],
    loading: query.isLoading,
    add: (ticker: string) => addMut.mutate(ticker),
    remove: (ticker: string) => removeMut.mutate(ticker),
  };
}
