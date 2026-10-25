import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { positionSize } from '../../src/finance/positionSize.js';

describe('positionSize', () => {
  it('risque le pourcentage demandé du capital, arrondi au titre inférieur', () => {
    // 10 000 € × 1 % = 100 € de risque ; 4 € de risque par titre → 25 titres.
    expect(positionSize({ capitalEur: 10_000, riskPct: 1, entryEur: 100, stopEur: 96 })).toEqual({
      shares: 25,
      amountEur: 2_500,
      maxLossEur: 100,
      cappedByCapital: false,
    });
  });

  it('ne dépasse jamais le capital disponible', () => {
    // Stop très serré : 1 000 titres pour risquer 100 €, mais 10 000 € n'achètent que 100 titres.
    expect(positionSize({ capitalEur: 10_000, riskPct: 1, entryEur: 100, stopEur: 99.9 })).toMatchObject({
      shares: 100,
      amountEur: 10_000,
      cappedByCapital: true,
    });
  });

  it('renvoie 0 titre quand un seul titre dépasserait le risque accepté', () => {
    expect(positionSize({ capitalEur: 1_000, riskPct: 0.5, entryEur: 400, stopEur: 380 })).toMatchObject({ shares: 0, maxLossEur: 0 });
  });

  it('ne se trompe pas sur un résultat entier sujet aux arrondis flottants', () => {
    // 3 000 × 1 % / (10,3 − 10,0) = 100 exactement, mais 30 / 0,3 vaut 99,99… en flottant.
    expect(positionSize({ capitalEur: 3_000, riskPct: 1, entryEur: 10.3, stopEur: 10 })?.shares).toBe(100);
  });

  it.each([
    ['capital non renseigné', { capitalEur: null, riskPct: 1, entryEur: 100, stopEur: 96 }],
    ['pas de stop (long terme)', { capitalEur: 10_000, riskPct: 1, entryEur: 100, stopEur: null }],
    ['montant en euros indisponible', { capitalEur: 10_000, riskPct: 1, entryEur: null, stopEur: 96 }],
    ['stop au-dessus de l’entrée', { capitalEur: 10_000, riskPct: 1, entryEur: 100, stopEur: 101 }],
  ])('renvoie null : %s', (_label, input) => {
    expect(positionSize(input)).toBeNull();
  });

  it('respecte toujours le risque et le capital', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 1e7, noNaN: true }),
        fc.constantFrom(0.5, 1, 2, 5),
        fc.double({ min: 1, max: 5_000, noNaN: true }),
        fc.double({ min: 0.001, max: 0.5, noNaN: true }),
        (capitalEur, riskPct, entryEur, stopGap) => {
          const p = positionSize({ capitalEur, riskPct, entryEur, stopEur: entryEur * (1 - stopGap) });
          if (!p) return false;
          return p.amountEur <= capitalEur + 1e-6 && p.maxLossEur <= (capitalEur * riskPct) / 100 + 1e-6 && Number.isInteger(p.shares);
        },
      ),
    );
  });
});
