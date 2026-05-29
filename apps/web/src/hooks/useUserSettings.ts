import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
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

  // Réplique côté local dès qu'on a une réponse — anti-flicker au prochain reload
  useEffect(() => {
    if (query.data) {
      if (query.data.horizon !== local.horizon) local.setHorizon(query.data.horizon);
      if (query.data.theme !== local.theme) local.setTheme(query.data.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const mutate = useMutation({
    mutationFn: (patch: { horizon?: Horizon; theme?: 'dark' | 'light' }) =>
      api.saveSettings(patch),
    onSuccess: (_d, patch) => {
      qc.setQueryData(KEY, (prev: { horizon: Horizon; theme: 'dark' | 'light' } | undefined) => ({
        horizon: patch.horizon ?? prev?.horizon ?? 'medium',
        theme: patch.theme ?? prev?.theme ?? 'dark',
      }));
      if (patch.horizon) local.setHorizon(patch.horizon);
      if (patch.theme) local.setTheme(patch.theme);
    },
  });

  return {
    horizon: query.data?.horizon ?? local.horizon,
    theme: query.data?.theme ?? local.theme,
    loading: query.isLoading,
    setHorizon: (h: Horizon) => mutate.mutate({ horizon: h }),
    setTheme: (t: 'dark' | 'light') => mutate.mutate({ theme: t }),
  };
}
