import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { api, type PodcastEpisodeDto } from '@/services/api';
import { useAuth } from '@/lib/auth';

const CATS_KEY = ['podcast-categories'];
const EPS_KEY = ['podcast-episodes'];

export function usePodcastCategories() {
  const { user } = useAuth();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: CATS_KEY,
    queryFn: () => api.getCategories().then((r) => r.categories),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const addMut = useMutation({
    mutationFn: (name: string) => api.addCategory(name),
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: CATS_KEY });
      const prev = qc.getQueryData<string[]>(CATS_KEY) ?? [];
      if (!prev.some((c) => c.toLowerCase() === name.toLowerCase())) {
        qc.setQueryData(CATS_KEY, [...prev, name]);
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(CATS_KEY, ctx.prev);
      message.error((e as Error).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CATS_KEY }),
  });

  const removeMut = useMutation({
    mutationFn: (name: string) => api.removeCategory(name),
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: CATS_KEY });
      const prev = qc.getQueryData<string[]>(CATS_KEY) ?? [];
      qc.setQueryData(CATS_KEY, prev.filter((c) => c !== name));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(CATS_KEY, ctx.prev);
      message.error((e as Error).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CATS_KEY }),
  });

  return {
    categories: query.data ?? [],
    loading: query.isLoading,
    add: (name: string) => addMut.mutate(name.trim()),
    remove: (name: string) => removeMut.mutate(name),
  };
}

export function usePodcastEpisodes() {
  const { user } = useAuth();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: EPS_KEY,
    queryFn: () => api.getEpisodes().then((r) => r.episodes),
    enabled: !!user,
    staleTime: 60_000,
  });

  const addMut = useMutation({
    mutationFn: (ep: Omit<PodcastEpisodeDto, 'id' | 'createdAt'>) => api.saveEpisode(ep),
    onSettled: () => qc.invalidateQueries({ queryKey: EPS_KEY }),
    onError: (e) => message.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteEpisode(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: EPS_KEY });
      const prev = qc.getQueryData<PodcastEpisodeDto[]>(EPS_KEY) ?? [];
      qc.setQueryData(EPS_KEY, prev.filter((e) => e.id !== id));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(EPS_KEY, ctx.prev);
      message.error((e as Error).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: EPS_KEY }),
  });

  return {
    episodes: query.data ?? [],
    loading: query.isLoading,
    add: (ep: Omit<PodcastEpisodeDto, 'id' | 'createdAt'>) => addMut.mutateAsync(ep),
    remove: (id: string) => deleteMut.mutate(id),
  };
}
