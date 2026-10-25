import { useQuery } from '@tanstack/react-query';
import { api, type MarketThemes } from '@/services/api';
import type { Horizon } from '@/constants/horizons';
import { useMarketThemes } from './useNewsAnalysis';
import { rowToView, type TickerView } from './useSignals';

export interface ThematicPick {
  ticker: TickerView;
  name: string;
  themes: string[];
  /** −1..+1, moyenne des directions des thèmes concernés. */
  themeBias: number;
}

interface UseThematicPicksResult {
  themes: MarketThemes['themes'] | undefined;
  themesLoading: boolean;
  themesError: Error | null;
  picks: ThematicPick[];
  picksLoading: boolean;
  /** Échec du classement lui-même (thèmes indisponibles, quota…). */
  picksError: Error | null;
  /** Candidats non classés faute de score, avec l'erreur qui l'explique. */
  picksErrors: { symbol: string; error: Error }[];
}

/**
 * Idées du moment : les thèmes s'affichent dès qu'ils sont prêts (requête
 * rapide, en cache) ; le classement est calculé par le BFF (/api/ideas).
 */
export function useThematicPicks(horizon: Horizon): UseThematicPicksResult {
  const themesQuery = useMarketThemes();
  const ideas = useQuery({
    queryKey: ['ideas', horizon],
    queryFn: () => api.ideas(horizon),
    staleTime: 60_000,
  });

  return {
    themes: themesQuery.data?.themes,
    themesLoading: themesQuery.isLoading,
    themesError: themesQuery.error as Error | null,
    picks: (ideas.data?.picks ?? []).map((p) => ({
      ticker: rowToView(p.symbol, p.row),
      name: p.name,
      themes: p.themes,
      themeBias: p.themeBias,
    })),
    picksLoading: ideas.isLoading,
    picksError: ideas.error as Error | null,
    picksErrors: (ideas.data?.errors ?? []).map((e) => ({ symbol: e.symbol, error: new Error(e.error) })),
  };
}
