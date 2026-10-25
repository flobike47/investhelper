import { describe, expect, it } from 'vitest';
import { formatEur, formatMoney } from './currency';

describe('formatMoney', () => {
  it('affiche le montant en euros quand le BFF a pu le convertir', () => {
    expect(formatMoney({ native: 110, eur: 100 }, 'USD')).toBe(formatEur(100));
  });

  it('affiche le prix natif avec sa devise quand le taux manque', () => {
    expect(formatMoney({ native: 110, eur: null }, 'USD')).toMatch(/\$/);
  });

  it('affiche un tiret sans montant', () => {
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatMoney({ native: null, eur: null }, 'USD')).toBe('—');
  });
});
