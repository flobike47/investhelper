// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildTradeLevels } from './tradePlan';
import { analyzeTechnicals } from './scoring';
import { HORIZONS } from '@/constants/horizons';
import type { Signal } from './scoring';
import { PULLBACK_IN_UPTREND, candleOf, linear } from './testSeries';

const NO_LEVELS = { entry: null, stop: null, target: null, riskReward: null, unfavorable: false };

describe('buildTradeLevels', () => {
  it('place le stop sous le cours même quand le cours est sous la moyenne courte (J3)', () => {
    const candle = candleOf(PULLBACK_IN_UPTREND);
    const tech = analyzeTechnicals(candle, HORIZONS.short);
    const lastClose = PULLBACK_IN_UPTREND.at(-1)!;
    expect(tech.smaShort!).toBeGreaterThan(lastClose); // ancien stop = SMA20 × 0,97 > cours

    const p = buildTradeLevels({ candle, signal: 'buy', horizon: HORIZONS.short, smaShort: tech.smaShort, targetMean: null });
    expect(p.entry).toBe(lastClose);
    expect(p.stop!).toBeLessThan(lastClose);
    expect(p.target!).toBeGreaterThan(lastClose);
  });

  it.each<Signal>(['sell', 'unknown'])("ne propose ni entrée, ni stop, ni objectif sur un signal '%s' (J5)", (signal) => {
    const p = buildTradeLevels({ candle: candleOf(PULLBACK_IN_UPTREND), signal, horizon: HORIZONS.short, smaShort: 200, targetMean: 300 });
    expect(p).toEqual(NO_LEVELS);
  });

  it('suit le signal fourni (le signal combiné affiché) et non le vote technique (J4)', () => {
    const p = buildTradeLevels({ candle: candleOf(PULLBACK_IN_UPTREND), signal: 'hold', horizon: HORIZONS.short, smaShort: 200, targetMean: null });
    expect(p.entry).not.toBeNull();
  });

  it('court terme : objectif à 2 fois le risque pris, donc gain/risque de 2', () => {
    const p = buildTradeLevels({ candle: candleOf(linear(120, 100, 0.1)), signal: 'buy', horizon: HORIZONS.short, smaShort: 110, targetMean: null });
    // Amplitude constante de 2 et pas de 0,1 → ATR = 2 ; stop à 2 ATR sous l'entrée.
    expect(p.entry).toBeCloseTo(110, 10);
    expect(p.stop!).toBeCloseTo(106, 10);
    expect(p.target!).toBeCloseTo(118, 10);
    expect(p.riskReward!).toBeCloseTo(2, 10);
    expect(p.unfavorable).toBe(false);
  });

  describe('moyen terme : objectif = cible des analystes', () => {
    const candle = candleOf(linear(250, 100, 0.1)); // dernier cours 124,9 ; ATR = 2
    const base = { candle, signal: 'buy' as const, horizon: HORIZONS.medium, smaShort: 120 };

    it('calcule le gain/risque avec un stop à 3 ATR', () => {
      const p = buildTradeLevels({ ...base, targetMean: 135 });
      expect(p.stop!).toBeCloseTo(114, 10);
      expect(p.target).toBe(135);
      expect(p.riskReward!).toBeCloseTo(2.5, 10);
      expect(p.unfavorable).toBe(false);
    });

    it('signale un rapport défavorable sous 1,5', () => {
      const p = buildTradeLevels({ ...base, targetMean: 126 });
      expect(p.riskReward!).toBeCloseTo(1, 10);
      expect(p.unfavorable).toBe(true);
    });

    it("n'affiche pas d'objectif déjà dépassé par le cours", () => {
      const p = buildTradeLevels({ ...base, targetMean: 124 });
      expect(p.target).toBeNull();
      expect(p.riskReward).toBeNull();
    });
  });

  it('long terme : pas de stop technique (sortie sur thèse), objectif analystes conservé (J6)', () => {
    const p = buildTradeLevels({ candle: candleOf(linear(261, 100, 1)), signal: 'buy', horizon: HORIZONS.long, smaShort: 340, targetMean: 450 });
    expect(p.stop).toBeNull();
    expect(p.target).toBe(450);
    expect(p.riskReward).toBeNull();
  });

  it('ne calcule rien sans bougies', () => {
    expect(buildTradeLevels({ candle: null, signal: 'buy', horizon: HORIZONS.short, smaShort: null, targetMean: null })).toEqual(NO_LEVELS);
  });

  it('garantit toujours stop < entrée ≤ cours < objectif quand ces niveaux existent', () => {
    const series = fc.array(fc.double({ min: 1, max: 1000, noNaN: true }), { minLength: 20, maxLength: 120 });
    fc.assert(
      fc.property(
        series,
        fc.double({ min: 0.01, max: 50, noNaN: true }),
        fc.constantFrom<Signal>('buy', 'hold'),
        fc.constantFrom(HORIZONS.short, HORIZONS.medium, HORIZONS.long),
        fc.option(fc.double({ min: 1, max: 1000, noNaN: true })),
        fc.option(fc.double({ min: 1, max: 2000, noNaN: true })),
        (closes, range, signal, horizon, smaShort, targetMean) => {
          const p = buildTradeLevels({ candle: candleOf(closes, range), signal, horizon, smaShort, targetMean });
          const last = closes[closes.length - 1];
          if (p.entry !== null && p.entry > last) return false;
          if (p.stop !== null && (p.entry === null || p.stop >= p.entry || p.stop <= 0)) return false;
          if (p.target !== null && p.target <= last) return false;
          return true;
        },
      ),
    );
  });
});
