import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuth } from '@/lib/auth';

/** Quotas IA du jour de l'utilisateur courant. */
export function useQuotas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['quotas', user?.id],
    queryFn: () => api.getQuotas().then((r) => r.quotas),
    enabled: !!user,
    staleTime: 30_000,
  });
}
