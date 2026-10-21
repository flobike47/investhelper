import { describe, expect, it } from 'vitest';
import { formatSignedPct } from './format';

const NNBSP = '\u202f';

describe('formatSignedPct', () => {
  it.each([
    [1.234, `+1,23${NNBSP}%`],
    [-0.5, `-0,50${NNBSP}%`],
    [0, `0,00${NNBSP}%`],
    // un -0,001 arrondi ne doit pas afficher « -0,00 »
    [-0.001, `0,00${NNBSP}%`],
  ])('%s → %s', (v, expected) => {
    // Intl peut utiliser le signe moins typographique selon l'environnement
    expect(formatSignedPct(v).replace('−', '-')).toBe(expected);
  });

  it('valeur absente → tiret', () => {
    expect(formatSignedPct(null)).toBe('—');
    expect(formatSignedPct(undefined)).toBe('—');
    expect(formatSignedPct(NaN)).toBe('—');
  });

  it('respecte la précision demandée', () => {
    expect(formatSignedPct(12.345, 1).replace('−', '-')).toBe(`+12,3${NNBSP}%`);
  });
});
