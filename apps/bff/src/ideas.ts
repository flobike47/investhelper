import type { FastifyBaseLogger } from 'fastify';
import type { Horizon } from './finance/horizons.js';
import { computeRows, type SignalRow } from './signals.js';
import { getMarketThemes, type MarketThemes } from './themes.js';
import { UNIVERSE, type Sector, type UniverseEntry } from './universe.js';

/** Titres dont on calcule le signal : borne la charge sur les providers. */
export const MAX_CANDIDATES = 25;
/** Au plus 3 titres par secteur principal parmi les candidats, pour la diversité. */
export const MAX_PER_SECTOR = 3;
/** Poids du biais thématique dans le classement final (score −100..100 ± 15). */
const THEME_WEIGHT = 15;

type Theme = MarketThemes['themes'][number];

export interface Candidate {
  entry: UniverseEntry;
  /** Noms des thèmes auxquels le titre est exposé. */
  themes: string[];
  /** Moyenne des directions des thèmes concernés (−1 baissier … +1 haussier). */
  themeBias: number;
}

/**
 * Candidats : tous les titres de l'univers exposés à au moins un thème, triés
 * par nombre de thèmes concernés puis par biais, au plus MAX_PER_SECTOR par
 * secteur principal, bornés à MAX_CANDIDATES. Fonction pure.
 */
export function rankCandidates(themes: Theme[], universe: UniverseEntry[] = UNIVERSE): Candidate[] {
  const candidates: (Candidate & { order: number })[] = [];
  universe.forEach((entry, order) => {
    const matched = themes.filter((t) => t.sectors.some((s) => entry.sectors.includes(s as Sector)));
    if (matched.length === 0) return;
    const bias =
      matched.reduce((sum, t) => sum + (t.direction === 'bullish' ? 1 : t.direction === 'bearish' ? -1 : 0), 0) /
      matched.length;
    candidates.push({ entry, themes: matched.map((t) => t.name), themeBias: bias, order });
  });
  candidates.sort((a, b) => b.themes.length - a.themes.length || b.themeBias - a.themeBias || a.order - b.order);

  const perSector = new Map<Sector, number>();
  const kept: Candidate[] = [];
  for (const c of candidates) {
    const sector = c.entry.sectors[0];
    const n = perSector.get(sector) ?? 0;
    if (n >= MAX_PER_SECTOR) continue;
    perSector.set(sector, n + 1);
    kept.push({ entry: c.entry, themes: c.themes, themeBias: c.themeBias });
    if (kept.length >= MAX_CANDIDATES) break;
  }
  return kept;
}

export interface IdeaPick {
  symbol: string;
  name: string;
  themes: string[];
  themeBias: number;
  row: SignalRow;
}

export interface Ideas {
  themes: MarketThemes['themes'];
  picks: IdeaPick[];
  /** Candidats non classés faute de score, avec la raison. */
  errors: { symbol: string; error: string }[];
}

/** Classement final : score combiné + biais thématique ; les titres sans score sont écartés. */
export function rankPicks(candidates: Candidate[], rows: SignalRow[], topN: number): IdeaPick[] {
  return candidates
    .map((c, i) => ({ c, row: rows[i] }))
    .filter(({ row }) => row && row.score !== null)
    .map(({ c, row }) => ({
      pick: { symbol: c.entry.symbol, name: c.entry.name, themes: c.themes, themeBias: c.themeBias, row },
      final: (row.score as number) + c.themeBias * THEME_WEIGHT,
    }))
    .sort((a, b) => b.final - a.final)
    .slice(0, topN)
    .map(({ pick }) => pick);
}

export async function computeIdeas(userId: string, horizon: Horizon, topN: number, log?: FastifyBaseLogger): Promise<Ideas> {
  const { themes } = await getMarketThemes(userId);
  const candidates = rankCandidates(themes);
  const rows = await computeRows(candidates.map((c) => c.entry.symbol), horizon, log);
  return {
    themes,
    picks: rankPicks(candidates, rows, topN),
    errors: rows.filter((r) => r.score === null && r.errors.length > 0).map((r) => ({ symbol: r.symbol, error: r.errors.join(' · ') })),
  };
}
