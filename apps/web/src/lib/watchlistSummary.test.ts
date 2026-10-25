import { describe, expect, it } from 'vitest';
import {
  averageOfAvailable,
  describeError,
  summarizeWatchlist,
  tickerStatus,
  trendOf,
  type TickerSnapshot,
} from './watchlistSummary';

function snap(partial: Partial<TickerSnapshot> = {}): TickerSnapshot {
  return { loading: false, error: null, changePct: null, score: null, signal: 'unknown', ...partial };
}

describe('averageOfAvailable', () => {
  it('liste vide → null', () => {
    expect(averageOfAvailable([])).toBeNull();
  });

  it('uniquement des valeurs manquantes → null (jamais 0)', () => {
    expect(averageOfAvailable([null, undefined, NaN, Infinity])).toBeNull();
  });

  it('ignore les valeurs nulles au lieu de les compter pour 0', () => {
    // (2 + -1) / 2 = 0.5, et non (2 + -1 + 0) / 3
    expect(averageOfAvailable([2, null, -1, undefined])).toBeCloseTo(0.5);
  });

  it('garde un 0 réel', () => {
    expect(averageOfAvailable([0, 3])).toBeCloseTo(1.5);
  });
});

describe('trendOf', () => {
  it.each([
    [1.2, 'up'],
    [-0.4, 'down'],
    [0, 'flat'],
    // arrondi à l'affichage : « 0,00 % » ne doit pas porter de flèche
    [0.001, 'flat'],
    [-0.004, 'flat'],
    [null, null],
    [NaN, null],
  ] as const)('%s → %s', (v, expected) => {
    expect(trendOf(v)).toBe(expected);
  });
});

describe('summarizeWatchlist', () => {
  it('pendant le chargement : aucune valeur trompeuse', () => {
    const s = summarizeWatchlist([snap({ loading: true }), snap({ loading: true })]);
    expect(s).toMatchObject({
      avgChangePct: null,
      changeSampleSize: 0,
      scoredCount: 0,
      buyCount: 0,
      pendingCount: 2,
    });
  });

  it('moyenne sur les seuls tickers disponibles, compteur sur les seuls scorés', () => {
    const s = summarizeWatchlist([
      snap({ changePct: 2, score: 60, signal: 'buy' }),
      snap({ changePct: 4, score: 10, signal: 'hold' }),
      snap({ loading: true }),
      snap({ error: new Error('boom') }),
    ]);
    expect(s.avgChangePct).toBeCloseTo(3);
    expect(s.changeSampleSize).toBe(2);
    expect(s.scoredCount).toBe(2);
    expect(s.buyCount).toBe(1);
    expect(s.pendingCount).toBe(1);
    expect(s.errorCount).toBe(1);
  });

  it('watchlist vide → agrégats nuls', () => {
    expect(summarizeWatchlist([]).avgChangePct).toBeNull();
  });
});

describe('tickerStatus', () => {
  const base = { ...snap(), price: null };
  it.each([
    [{ ...base, loading: true, error: new Error('x') }, 'loading'],
    [{ ...base, price: { native: 10, eur: 9 } }, 'ok'],
    [{ ...base, error: new Error('x') }, 'error'],
    [{ ...base, error: new Error('x'), price: { native: 10, eur: 9 } }, 'partial'],
    [{ ...base, error: new Error('x'), score: 10, signal: 'hold' as const }, 'partial'],
  ])('cas %#', (t, expected) => {
    expect(tickerStatus(t)).toBe(expected);
  });
});

describe('describeError', () => {
  it('null si pas d’erreur', () => {
    expect(describeError(null)).toBeNull();
  });

  it('ajoute le reqId d’une ApiError', () => {
    const err = Object.assign(new Error('Quota dépassé'), { reqId: 'abc' });
    expect(describeError(err)).toBe('Quota dépassé (réf. abc)');
  });

  it('message de repli si vide', () => {
    expect(describeError(new Error(''))).toBe('Erreur inconnue');
  });
});
