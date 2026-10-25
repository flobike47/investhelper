import { describe, expect, it } from 'vitest';
import { atr, lastDefined, rsi, sma } from './indicators';

describe('sma', () => {
  it('calcule la moyenne glissante et laisse null avant la première fenêtre complète', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('renvoie uniquement des null quand la série est plus courte que la période', () => {
    expect(sma([1, 2], 3)).toEqual([null, null]);
  });
});

describe('rsi (Wilder)', () => {
  const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
  const falling = Array.from({ length: 30 }, (_, i) => 200 - i);

  it('vaut 100 sur une série strictement croissante', () => {
    expect(lastDefined(rsi(rising, 14))).toBe(100);
  });

  it('vaut 0 sur une série strictement décroissante', () => {
    expect(lastDefined(rsi(falling, 14))).toBe(0);
  });

  it('ne fabrique pas de valeur quand les données manquent', () => {
    expect(lastDefined(rsi([1, 2, 3], 14))).toBeNull();
  });

  it('reste borné entre 0 et 100 sur une série oscillante', () => {
    const series = Array.from({ length: 200 }, (_, i) => 100 + 10 * Math.sin(i / 3) + (i % 7));
    for (const v of rsi(series, 14)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  // Exemple classique de Wilder (StockCharts). Leur tableau affiche 70.53 car il
  // part de moyennes arrondies (0.24 / 0.10) ; le calcul exact donne 70.464.
  it("reproduit l'exemple de référence de StockCharts", () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28,
    ];
    expect(rsi(closes, 14)[14]).toBeCloseTo(70.464, 3);
  });
});

describe('atr (Wilder)', () => {
  it('se calcule à la main sur une petite série avec écart d’ouverture', () => {
    // TR : 2, puis max(2, |12−9|, |10−9|) = 3, puis max(2, 0, |9−11|) = 2.
    // ATR(2) : (2 + 3) / 2 = 2,5 puis (2,5 × 1 + 2) / 2 = 2,25.
    expect(atr([10, 12, 11], [8, 10, 9], [9, 11, 10], 2)).toEqual([null, 2.5, 2.25]);
  });

  it("vaut l'amplitude quand elle est constante et sans écart", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
    const out = atr(closes.map((c) => c + 1), closes.map((c) => c - 1), closes, 14);
    expect(lastDefined(out)).toBeCloseTo(2, 10);
  });

  it('ne fabrique pas de valeur quand la série est plus courte que la période', () => {
    expect(lastDefined(atr([2, 3], [1, 2], [1.5, 2.5], 14))).toBeNull();
  });

  // Exemple de référence StockCharts (« Average True Range »), valeurs exactes
  // recalculées par une implémentation indépendante (Python) ; leur tableau
  // affiche les mêmes valeurs arrondies : 0,56 · 0,59 · 0,59 · 0,57 · 0,62 · 0,62 · 0,64.
  it("reproduit l'exemple de référence de StockCharts", () => {
    const h = [48.7, 48.72, 48.9, 48.87, 48.82, 49.05, 49.2, 49.35, 49.92, 50.19, 50.12, 49.66, 49.88, 50.19, 50.36, 50.57, 50.65, 50.43, 49.63, 50.33];
    const l = [47.79, 48.14, 48.39, 48.37, 48.24, 48.64, 48.94, 48.86, 49.5, 49.87, 49.2, 48.9, 49.43, 49.73, 49.26, 50.09, 50.3, 49.21, 48.98, 49.61];
    const c = [48.16, 48.61, 48.75, 48.63, 48.74, 49.03, 49.07, 49.32, 49.91, 50.13, 49.53, 49.5, 49.75, 50.03, 50.31, 50.52, 50.41, 49.34, 49.37, 50.23];
    const out = atr(h, l, c, 14);
    expect(out[12]).toBeNull();
    expect(out[13]).toBeCloseTo(0.554286, 5);
    expect(out[14]).toBeCloseTo(0.593265, 5);
    expect(out[19]).toBeCloseTo(0.641896, 5);
  });
});
