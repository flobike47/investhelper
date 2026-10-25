import { describe, expect, it } from 'vitest';
import { convertToEur, formatEur } from '../../src/finance/currency.js';

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

describe('formatEur', () => {
  // Le serveur doit embarquer les données de locale fr-FR (ICU complète).
  it('formate à la française', () => {
    expect(formatEur(1234.5)).toBe('1 234,50 €');
  });

  it('affiche un tiret pour une valeur absente', () => {
    expect(formatEur(null)).toBe('—');
  });
});
