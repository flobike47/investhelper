// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findRsiAnalog, pickBucketFromRsi } from './historicalAnalog';
import { candleOf, linear, segments } from './testSeries';

/** Deux épisodes de survente bien séparés, chacun suivi d'une reprise. */
const TWO_DIPS = segments(100, [
  { n: 60, step: 1 },
  { n: 10, step: -3 },
  { n: 40, step: 1 },
  { n: 10, step: -3 },
  { n: 60, step: 1 },
]);

describe('findRsiAnalog', () => {
  it('ne calcule rien sans données ou sur moins de 60 bougies', () => {
    expect(findRsiAnalog(null, { rsiBucket: 'oversold', horizonDays: 5 })).toBeNull();
    expect(findRsiAnalog(candleOf(linear(59, 100, 1)), { rsiBucket: 'oversold', horizonDays: 5 })).toBeNull();
  });

  it("renvoie 0 occurrence et aucune statistique quand le setup n'est jamais apparu", () => {
    const a = findRsiAnalog(candleOf(linear(120, 100, 1)), { rsiBucket: 'oversold', horizonDays: 5 });
    expect(a).toMatchObject({ occurrences: 0, medianReturn: null, positiveRatio: null });
  });

  it('compte un seul cas par épisode de survente, pas un par jour', () => {
    const a = findRsiAnalog(candleOf(TWO_DIPS), { rsiBucket: 'oversold', horizonDays: 5 });
    expect(a?.occurrences).toBe(2);
  });

  it('mesure le retour sur la fenêtre demandée et le borne par le pire et le meilleur cas', () => {
    const a = findRsiAnalog(candleOf(TWO_DIPS), { rsiBucket: 'oversold', horizonDays: 20 });
    expect(a?.medianReturn).not.toBeNull();
    expect(a!.worstReturn!).toBeLessThanOrEqual(a!.medianReturn!);
    expect(a!.bestReturn!).toBeGreaterThanOrEqual(a!.medianReturn!);
    expect(a?.horizonDays).toBe(20);
  });
});

describe('pickBucketFromRsi', () => {
  it.each([
    [null, 'neutral'],
    [25, 'oversold'],
    [39.9, 'oversold'],
    [50, 'neutral'],
    [60.1, 'overbought'],
  ] as const)('RSI %s → %s', (r, expected) => {
    expect(pickBucketFromRsi(r)).toBe(expected);
  });
});
