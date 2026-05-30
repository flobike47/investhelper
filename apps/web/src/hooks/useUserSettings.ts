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

  useEffect(() => {
    if (query.data) {
      if (query.data.horizon !== local.horizon) local.setHorizon(query.data.horizon);
      if (query.data.theme !== local.theme) local.setTheme(query.data.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const mutate = useMutation({
    mutationFn: (patch: Partial<UserSettings>) => api.saveSettings(patch),
    onSuccess: (_d, patch) => {
      qc.setQueryData(KEY, (prev: UserSettings | undefined) => ({
        horizon: patch.horizon ?? prev?.horizon ?? 'medium',
        theme: patch.theme ?? prev?.theme ?? 'dark',
        podcastDuration: patch.podcastDuration ?? prev?.podcastDuration ?? 'auto',
      }));
      if (patch.horizon) local.setHorizon(patch.horizon);
      if (patch.theme) local.setTheme(patch.theme);
    },
  });

  return {
    horizon: query.data?.horizon ?? local.horizon,
    theme: query.data?.theme ?? local.theme,
    podcastDuration: query.data?.podcastDuration ?? 'auto',
    loading: query.isLoading,
    setHorizon: (h: Horizon) => mutate.mutate({ horizon: h }),
    setTheme: (t: 'dark' | 'light') => mutate.mutate({ theme: t }),
    setPodcastDuration: (d: PodcastDuration) => mutate.mutate({ podcastDuration: d }),
  };
}
