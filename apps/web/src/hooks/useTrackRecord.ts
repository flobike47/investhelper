import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { Horizon } from '@/constants/horizons';

export function useTrackRecord(horizon: Horizon) {
  return useQuery({
    queryKey: ['track-record', horizon],
    queryFn: () => api.trackRecord(horizon),
    // Recalculé au plus toutes les 6 h côté BFF
    staleTime: 60 * 60_000,
  });
}
