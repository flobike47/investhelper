import { describe, expect, it } from 'vitest';
import { MAX_CANDIDATES, MAX_PER_SECTOR, rankCandidates, rankPicks } from '../src/ideas.js';
import { UNIVERSE, type UniverseEntry } from '../src/universe.js';
import type { SignalRow } from '../src/signals.js';

const theme = (name: string, sectors: string[], direction: 'bullish' | 'bearish' | 'neutral' = 'bullish') => ({
  name,
  direction,
  sectors,
  summary: '',
});

describe('rankCandidates', () => {
  it("ne coupe plus les candidats dans l'ordre du fichier : les ETF en fin d'univers restent atteignables", () => {
    // Avant : les 25 premiers titres du fichier (tech US) seulement.
    const c = rankCandidates([theme('IA', ['ai', 'semis', 'cloud']), theme('Indices', ['etf_broad'])]);
    expect(c.some((x) => x.entry.sectors[0] === 'etf_broad')).toBe(true);
  });

  it(`garde au plus ${MAX_PER_SECTOR} titres par secteur principal et ${MAX_CANDIDATES} au total`, () => {
    const all = [...new Set(UNIVERSE.flatMap((u) => u.sectors))];
    const c = rankCandidates([theme('Tout', all)]);
    expect(c.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    const counts = new Map<string, number>();
    c.forEach((x) => counts.set(x.entry.sectors[0], (counts.get(x.entry.sectors[0]) ?? 0) + 1));
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(MAX_PER_SECTOR);
  });

  it('classe d’abord les titres exposés à plusieurs thèmes', () => {
    const universe: UniverseEntry[] = [
      { symbol: 'ONE', name: 'Un thème', sectors: ['banks'] },
      { symbol: 'TWO', name: 'Deux thèmes', sectors: ['defense', 'industrials'] },
    ];
    const c = rankCandidates([theme('Défense', ['defense']), theme('Industrie', ['industrials']), theme('Banques', ['banks'])], universe);
    expect(c.map((x) => x.entry.symbol)).toEqual(['TWO', 'ONE']);
  });

  it('normalise le biais par les thèmes concernés, pas par le total', () => {
    const universe: UniverseEntry[] = [{ symbol: 'XOM', name: 'Exxon', sectors: ['energy_fossil'] }];
    const c = rankCandidates(
      [theme('Pétrole', ['energy_fossil'], 'bullish'), theme('IA', ['ai']), theme('Luxe', ['luxury']), theme('Chine', ['china'])],
      universe,
    );
    expect(c[0].themeBias).toBe(1); // avant : 1 / 4 thèmes = 0,25
  });

  it('ne retient aucun titre sans thème', () => {
    expect(rankCandidates([])).toEqual([]);
  });
});

const row = (symbol: string, score: number | null): SignalRow => ({
  symbol,
  name: null,
  currency: 'USD',
  price: { native: 1, eur: 1 },
  changePct: 0,
  score,
  signal: 'hold',
  closes: [],
  errors: score === null ? ['Historique indisponible'] : [],
});

describe('rankPicks', () => {
  const cand = (symbol: string, themeBias: number) => ({ entry: { symbol, name: symbol, sectors: ['ai' as const] }, themes: ['IA'], themeBias });

  it('classe par score combiné + biais thématique et écarte les titres sans score', () => {
    const picks = rankPicks([cand('A', 0), cand('B', 1), cand('C', 1)], [row('A', 20), row('B', 10), row('C', null)], 5);
    expect(picks.map((p) => p.symbol)).toEqual(['B', 'A']); // 10 + 15 > 20
  });

  it('limite au nombre demandé', () => {
    expect(rankPicks([cand('A', 0), cand('B', 0)], [row('A', 1), row('B', 2)], 1).map((p) => p.symbol)).toEqual(['B']);
  });
});
