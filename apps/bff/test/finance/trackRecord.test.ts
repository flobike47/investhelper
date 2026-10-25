import { describe, expect, it } from 'vitest';
import { computeTrackRecord, type SnapshotPoint } from '../../src/finance/trackRecord.js';
import type { Signal } from '../../src/finance/scoring.js';

/** Instantanés quotidiens à partir du 2026-01-01 : (décalage en jours, signal, cours). */
function series(symbol: string, rows: [number, Signal, number][]): SnapshotPoint[] {
  return rows.map(([offset, signal, price]) => ({
    symbol,
    day: new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10),
    signal,
    price,
  }));
}

describe('computeTrackRecord', () => {
  it('mesure le rendement à 1 mois et l’écart avec le repère sur les mêmes dates', () => {
    const r = computeTrackRecord([
      ...series('AAPL', [[0, 'buy', 100], [30, 'buy', 110]]),
      ...series('SPY', [[0, 'hold', 500], [30, 'hold', 510]]),
    ]);
    expect(r.bySignal.buy['1m'].n).toBe(1);
    expect(r.bySignal.buy['1m'].medianReturn).toBeCloseTo(0.1, 10);
    expect(r.bySignal.buy['1m'].medianExcess).toBeCloseTo(0.1 - 0.02, 10);
    expect(r.bySignal.buy['1m'].significant).toBe(false);
  });

  it('ne compte un signal répété jour après jour qu’une seule fois', () => {
    const rows: [number, Signal, number][] = Array.from({ length: 40 }, (_, d) => [d, 'buy', 100 + d]);
    const r = computeTrackRecord(series('AAPL', rows));
    expect(r.bySignal.buy['1m'].n).toBe(1);
  });

  it('compte un nouveau cas à chaque changement de signal', () => {
    const r = computeTrackRecord(
      series('AAPL', [[0, 'buy', 100], [10, 'sell', 105], [20, 'buy', 95], [30, 'buy', 98], [40, 'buy', 100], [50, 'buy', 102]]),
    );
    expect(r.bySignal.buy['1m'].n).toBe(2); // jours 0 et 20 (arrivées aux jours 30 et 50)
    expect(r.bySignal.sell['1m'].n).toBe(1); // jour 10 (arrivée jour 40)
  });

  it("n'utilise pas un cours arrivé trop tard (symbole plus suivi pendant des mois)", () => {
    const r = computeTrackRecord(series('AAPL', [[0, 'buy', 100], [120, 'buy', 150]]));
    expect(r.bySignal.buy['1m'].n).toBe(0);
    expect(r.bySignal.buy['3m'].n).toBe(0);
  });

  it("n'a rien à mesurer tant que la fenêtre n'est pas écoulée", () => {
    const r = computeTrackRecord(series('AAPL', [[0, 'buy', 100], [5, 'buy', 101]]));
    expect(r.bySignal.buy['1m']).toEqual({ n: 0, medianReturn: null, medianExcess: null, significant: false });
  });

  it('ignore les signaux inconnus et le repère lui-même', () => {
    const r = computeTrackRecord([
      ...series('AAPL', [[0, 'unknown', 100], [30, 'unknown', 110]]),
      ...series('SPY', [[0, 'buy', 500], [30, 'buy', 510]]),
    ]);
    expect(r.bySignal.buy['1m'].n).toBe(0);
    expect(r.since).toBe('2026-01-01');
  });

  it('devient significatif à partir de 8 cas', () => {
    const points = Array.from({ length: 8 }, (_, i) => series(`S${i}`, [[0, 'buy', 100], [30, 'buy', 101]])).flat();
    expect(computeTrackRecord(points).bySignal.buy['1m'].significant).toBe(true);
  });
});
