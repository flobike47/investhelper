// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { analyzeTechnicals, combine, summarizeAnalysts, type AnalystSummary, type Signal, type TechnicalAnalysis } from './scoring';
import { HORIZONS } from '@/constants/horizons';
import type { RecommendationTrend } from '@/types/finnhub';
import { BOUNCE_IN_DOWNTREND, PULLBACK_IN_UPTREND, candleOf, linear } from './testSeries';

const short = HORIZONS.short;

describe('analyzeTechnicals', () => {
  it("renvoie 'unknown' sans bougies, sans inventer d'indicateur", () => {
    const t = analyzeTechnicals(null, short);
    expect(t).toMatchObject({ signal: 'unknown', rsi: null, smaShort: null, smaLong: null, trend: 'unknown' });
  });

  it("renvoie 'unknown' quand le provider n'a pas de données", () => {
    expect(analyzeTechnicals(candleOf([], 1, { s: 'no_data' }), short).signal).toBe('unknown');
  });

  it('voit un signal haussier sur un repli en survente dans une tendance haussière', () => {
    const t = analyzeTechnicals(candleOf(PULLBACK_IN_UPTREND), short);
    expect(t.trend).toBe('up');
    expect(t.rsi).toBeLessThan(30);
    expect(t.signal).toBe('buy');
  });

  it('voit un signal baissier sur un rebond en surachat dans une tendance baissière', () => {
    const t = analyzeTechnicals(candleOf(BOUNCE_IN_DOWNTREND), short);
    expect(t.trend).toBe('down');
    expect(t.rsi).toBeGreaterThan(70);
    expect(t.signal).toBe('sell');
  });

  it('reste neutre sur une hausse régulière (tendance haussière mais RSI en surachat)', () => {
    const t = analyzeTechnicals(candleOf(linear(120, 100, 1)), short);
    expect(t.trend).toBe('up');
    expect(t.rsi).toBe(100);
    expect(t.signal).toBe('hold');
  });

  it("laisse la tendance inconnue quand l'historique est plus court que la moyenne longue", () => {
    const t = analyzeTechnicals(candleOf(linear(30, 100, 1)), short);
    expect(t.smaLong).toBeNull();
    expect(t.trend).toBe('unknown');
  });

  it('explique chaque vote dans la rationale', () => {
    const t = analyzeTechnicals(candleOf(PULLBACK_IN_UPTREND), short);
    expect(t.rationale.some((r) => r.includes('survente'))).toBe(true);
    expect(t.rationale.some((r) => r.includes('tendance haussière'))).toBe(true);
  });
});

function trend(counts: Partial<RecommendationTrend>): RecommendationTrend[] {
  return [{ symbol: 'X', period: '2026-10-01', strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0, ...counts }];
}

describe('summarizeAnalysts', () => {
  it.each<[string, RecommendationTrend[] | null, Signal]>([
    ['aucune donnée', null, 'unknown'],
    ['aucun analyste', trend({}), 'unknown'],
    ['majorité à l’achat', trend({ strongBuy: 3, buy: 3, hold: 2 }), 'buy'],
    ['plus de ventes que d’achats', trend({ buy: 1, sell: 2, hold: 1 }), 'sell'],
    ['plus d’achats que de ventes mais sous 50 %', trend({ buy: 2, hold: 5, sell: 1 }), 'hold'],
  ])('%s → %s', (_label, trends, expected) => {
    expect(summarizeAnalysts(trends, null).signal).toBe(expected);
  });

  it('transmet les objectifs de cours tels quels', () => {
    const a = summarizeAnalysts(trend({ buy: 1 }), {
      symbol: 'X', lastUpdated: '', targetHigh: 150, targetLow: 90, targetMean: 120, targetMedian: 118,
    });
    expect(a).toMatchObject({ targetMean: 120, targetHigh: 150, targetLow: 90 });
  });
});

function tech(signal: Signal): TechnicalAnalysis {
  return { signal, rsi: null, smaShort: null, smaLong: null, trend: 'unknown', entry: null, exit: null, rationale: [] };
}
function analyst(signal: Signal, targetMean: number | null = null): AnalystSummary {
  return { signal, buyRatio: 0, totalAnalysts: 0, period: null, targetMean, targetHigh: null, targetLow: null };
}

describe('combine', () => {
  it.each<[Signal, Signal, number, Signal]>([
    ['buy', 'buy', 90, 'buy'],
    ['sell', 'sell', -90, 'sell'],
    ['buy', 'unknown', 40, 'buy'],
    ['hold', 'hold', 0, 'hold'],
    // Comportement actuel (J7 de l'audit) : le consensus analystes seul suffit à
    // un signal haussier et un signal technique baissier ne peut pas l'annuler.
    ['unknown', 'buy', 50, 'buy'],
    ['sell', 'buy', 10, 'hold'],
  ])('technique %s + analystes %s → score %d, %s', (t, a, score, signal) => {
    expect(combine(tech(t), analyst(a), null)).toMatchObject({ score, signal });
  });

  it("renvoie 'unknown' quand aucune source n'a de signal", () => {
    expect(combine(tech('unknown'), analyst('unknown'), 100).signal).toBe('unknown');
  });

  it("plafonne l'apport de l'objectif analystes à 5 points", () => {
    expect(combine(tech('hold'), analyst('hold', 1000), 100).score).toBe(5);
    expect(combine(tech('hold'), analyst('hold', 1), 100).score).toBe(-5);
  });

  it('garde le score dans [-100, 100] quelles que soient les entrées', () => {
    const signal = fc.constantFrom<Signal>('buy', 'hold', 'sell', 'unknown');
    fc.assert(
      fc.property(signal, signal, fc.option(fc.double({ min: 0, max: 1e6, noNaN: true })), fc.option(fc.double({ min: 0, max: 1e6, noNaN: true })),
        (t, a, target, price) => {
          const { score } = combine(tech(t), analyst(a, target), price);
          return score >= -100 && score <= 100;
        }),
    );
  });
});
