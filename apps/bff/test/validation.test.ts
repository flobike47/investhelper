import { describe, expect, it } from 'vitest';
import { BadRequest, clampArray, clampInt, validateEnum, validateString, validateSymbol } from '../src/validation.js';

describe('validateSymbol', () => {
  it.each([['aapl', 'AAPL'], [' mc.pa ', 'MC.PA'], ['BRK-B', 'BRK-B']])('normalise %j en %s', (input, out) => {
    expect(validateSymbol(input)).toBe(out);
  });

  it.each(['', 'A'.repeat(21), 'AAPL;DROP', '../etc', 'A B'])('rejette %j en 400', (input) => {
    expect(() => validateSymbol(input)).toThrow(BadRequest);
  });
});

describe('validateString', () => {
  it('trim et accepte dans les bornes', () => {
    expect(validateString('  ok  ', 'x', 5)).toBe('ok');
  });

  it('rejette trop court ou trop long', () => {
    expect(() => validateString('  ', 'x', 5)).toThrow(/requis/);
    expect(() => validateString('abcdef', 'x', 5)).toThrow(/trop long/);
  });
});

describe('clampInt', () => {
  it.each([
    ['42', 42],
    [3.9, 3],
    [-5, 1],
    [999, 100],
    ['abc', 10],
    [undefined, 10],
  ])('clampInt(%j) → %i', (input, out) => {
    expect(clampInt(input, 10, 1, 100)).toBe(out);
  });
});

describe('validateEnum / clampArray', () => {
  it('retombe sur la valeur par défaut hors allowlist', () => {
    expect(validateEnum('W', ['D', 'W'] as const, 'D')).toBe('W');
    expect(validateEnum('X', ['D', 'W'] as const, 'D')).toBe('D');
  });

  it('coupe un tableau à la taille max', () => {
    expect(clampArray([1, 2, 3], 2)).toEqual([1, 2]);
  });
});
