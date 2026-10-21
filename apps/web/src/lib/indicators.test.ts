import { describe, expect, it } from 'vitest';
import { lastDefined, rsi, sma } from './indicators';

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
