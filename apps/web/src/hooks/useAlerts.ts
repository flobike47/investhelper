import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type NewPriceAlert } from '@/services/api';

/** Alertes de prix d'un actif (actives et déjà déclenchées). */
export function useAlerts(symbol: string) {
  const qc = useQueryClient();
  const key = ['alerts', symbol];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.getAlerts(symbol),
    enabled: !!symbol,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: (alert: NewPriceAlert) => api.createAlert(alert),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAlert(id),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { alerts: query.data?.alerts ?? [], loading: query.isLoading, error: query.error, create, remove };
}
