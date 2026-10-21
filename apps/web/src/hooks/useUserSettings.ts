import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PodcastDuration, type UserSettings } from '@/services/api';
import { useLocalSettings } from '@/store/localSettings';
import { useAuth } from '@/lib/auth';
import type { Horizon } from '@/constants/horizons';

const KEY = ['user-settings'];

/**
 * Source de vérité = serveur. Le store local n'est utilisé que pour
 * pré-rendre le thème AntD avant que le serveur réponde (anti-flicker).
 */
export function useUserSettings() {
  const { user } = useAuth();
  const local = useLocalSettings();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => api.getSettings(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // Miroir local des réglages serveur. Lecture via getState() : l'effet ne
  // dépend que des données serveur, pas des setters du store.
  useEffect(() => {
    if (!query.data) return;
    const store = useLocalSettings.getState();
    if (query.data.horizon !== store.horizon) store.setHorizon(query.data.horizon);
    if (query.data.theme !== store.theme) store.setTheme(query.data.theme);
  }, [query.data]);

  const mutate = useMutation({
    mutationFn: (patch: Partial<UserSettings>) => api.saveSettings(patch),
    onSuccess: (_d, patch) => {
      qc.setQueryData(KEY, (prev: UserSettings | undefined) => ({
        horizon: patch.horizon ?? prev?.horizon ?? 'medium',
        theme: patch.theme ?? prev?.theme ?? 'dark',
        podcastDuration: patch.podcastDuration ?? prev?.podcastDuration ?? 'auto',
      }));
      const store = useLocalSettings.getState();
      if (patch.horizon) store.setHorizon(patch.horizon);
      if (patch.theme) store.setTheme(patch.theme);
    },
  });

  return {
    horizon: query.data?.horizon ?? local.horizon,
    theme: query.data?.theme ?? local.theme,
    podcastDuration: query.data?.podcastDuration ?? 'auto',
    loading: query.isLoading,
    /** Erreur de chargement des réglages serveur (ApiError). */
    error: query.error,
    saving: mutate.isPending,
    setHorizon: (h: Horizon) => mutate.mutate({ horizon: h }),
    setTheme: (t: 'dark' | 'light') => mutate.mutate({ theme: t }),
    setPodcastDuration: (d: PodcastDuration) => mutate.mutate({ podcastDuration: d }),
    /** Enregistre plusieurs champs en une requête ; résout une fois confirmé par le serveur. */
    save: (patch: Partial<UserSettings>) => mutate.mutateAsync(patch),
  };
}
