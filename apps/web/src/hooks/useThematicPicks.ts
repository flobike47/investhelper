import { useMemo } from 'react';
import { useMarketThemes } from './useNewsAnalysis';
import { useSignals, type TickerView } from './useSignals';
import { symbolsForSectors, type Sector, type UniverseEntry } from '@/constants/universe';
import type { Horizon } from '@/constants/horizons';
import type { MarketThemes } from '@/services/api';

export interface ThematicPick {
  ticker: TickerView;
  entry: UniverseEntry;
  themes: string[];
  themeBias: number; // -1..+1 agrégé des directions de thèmes auxquels le ticker est exposé
}

interface UseThematicPicksResult {
  themes: MarketThemes['themes'] | undefined;
  themesLoading: boolean;
  themesError: Error | null;
  picks: ThematicPick[];
  picksLoading: boolean;
  /** Candidats non classés faute de score, avec l'erreur qui l'explique. */
  picksErrors: { symbol: string; error: Error }[];
}

function aggregateThemeBias(
  entry: UniverseEntry,
  themes: MarketThemes['themes'],
): { themes: string[]; bias: number } {
  const matched: string[] = [];
  let bias = 0;
  for (const t of themes) {
    const overlap = t.sectors.some((s) => entry.sectors.includes(s as Sector));
    if (overlap) {
      matched.push(t.name);
      bias += t.direction === 'bullish' ? 1 : t.direction === 'bearish' ? -1 : 0;
    }
  }
  return { themes: matched, bias: themes.length === 0 ? 0 : bias / themes.length };
}

export function useThematicPicks(horizon: Horizon, topN = 5): UseThematicPicksResult {
  const themesQuery = useMarketThemes();

  // Candidates = union of universe entries exposed to any current theme.
  const candidates = useMemo<UniverseEntry[]>(() => {
    if (!themesQuery.data) return [];
    const sectors = new Set<Sector>();
    for (const t of themesQuery.data.themes) {
      for (const s of t.sectors) sectors.add(s as Sector);
    }
    if (sectors.size === 0) return [];
    return symbolsForSectors(Array.from(sectors)).slice(0, 25); // cap to limit API conso
  }, [themesQuery.data]);

  const symbols = candidates.map((c) => c.symbol);
  const analyzed = useSignals(symbols, horizon);

  const picks = useMemo<ThematicPick[]>(() => {
    if (!themesQuery.data) return [];
    const enriched = analyzed
      .map((ticker, i) => {
        const entry = candidates[i];
        if (!entry || ticker.score === null) return null;
        const { themes, bias } = aggregateThemeBias(entry, themesQuery.data!.themes);
        // Final ranking score = combined score (-100..100) + theme bias bonus (-15..+15)
        const finalScore = ticker.score + bias * 15;
        return { ticker, entry, themes, themeBias: bias, finalScore };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, topN);

    return enriched.map(({ ticker, entry, themes, themeBias }) => ({
      ticker,
      entry,
      themes,
      themeBias,
    }));
  }, [analyzed, candidates, themesQuery.data, topN]);

  // Un candidat en erreur et sans score est exclu du classement : on le
  // remonte pour ne pas afficher un « aucune recommandation » trompeur.
  const picksErrors = analyzed
    .filter((a) => !a.loading && a.error !== null && a.score === null)
    .map((a) => ({ symbol: a.symbol, error: a.error as Error }));

  return {
    themes: themesQuery.data?.themes,
    themesLoading: themesQuery.isLoading,
    themesError: themesQuery.error as Error | null,
    picks,
    picksLoading: themesQuery.isLoading || analyzed.some((a) => a.loading),
    picksErrors,
  };
}
