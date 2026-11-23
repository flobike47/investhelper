import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration, formatSignedPct } from './format';

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

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [7.9, '0:07'],
    [102, '1:42'],
    [3725, '1:02:05'],
    [Number.NaN, '0:00'],
    [-3, '0:00'],
  ])('formatClock(%s) → %s', (input, out) => {
    expect(formatClock(input)).toBe(out);
  });
});

describe('formatDuration', () => {
  it.each([
    [120, '2 min'],
    [125, '2 min 05'],
    [0, '0 min'],
  ])('%s s → %s', (sec, expected) => {
    expect(formatDuration(sec)).toBe(expected);
  });
});
