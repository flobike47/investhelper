import { describe, expect, it } from 'vitest';
import { convertToEur, priceToEur } from './currency';

const rates = { USD: 1.1, GBP: 0.85 };

describe('convertToEur', () => {
  it('convertit avec le taux (1 EUR = X devise)', () => {
    expect(convertToEur(110, 'USD', rates)).toBeCloseTo(100);
  });

  it('laisse un montant déjà en EUR intact', () => {
    expect(convertToEur(42, 'EUR', null)).toBe(42);
  });

  // Régression : renvoyait le montant brut, affiché ensuite comme des euros.
  it('renvoie null sans taux plutôt que le montant natif', () => {
    expect(convertToEur(110, 'USD', null)).toBeNull();
    expect(convertToEur(110, 'JPY', rates)).toBeNull();
  });

  it('renvoie null pour une valeur absente ou non finie', () => {
    expect(convertToEur(null, 'USD', rates)).toBeNull();
    expect(convertToEur(Number.NaN, 'USD', rates)).toBeNull();
  });
});

describe('priceToEur', () => {
  it('affiche le prix natif avec sa devise quand le taux manque', () => {
    expect(priceToEur(110, 'AAPL', null)).toMatch(/\$/);
  });
});
