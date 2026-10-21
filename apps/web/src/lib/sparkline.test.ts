import { describe, expect, it } from 'vitest';
import { downsample, sparkPath } from './sparkline';

describe('downsample', () => {
  it('garde les extrémités et réduit au nombre de points demandé', () => {
    const values = Array.from({ length: 101 }, (_, i) => i);
    const out = downsample(values, 5);
    expect(out).toEqual([0, 25, 50, 75, 100]);
  });

  it('laisse une série courte intacte', () => {
    expect(downsample([1, 2, 3], 40)).toEqual([1, 2, 3]);
  });
});

describe('sparkPath', () => {
  it('trace dans la boîte : min en bas, max en haut', () => {
    expect(sparkPath([10, 20], 64, 28)).toBe('M0.0,27.0 L64.0,1.0');
  });

  it('ignore les valeurs non finies et renvoie un chemin vide sans au moins 2 points', () => {
    expect(sparkPath([Number.NaN, 5], 64, 28)).toBe('');
    expect(sparkPath([], 64, 28)).toBe('');
  });

  it('dessine une ligne plate pour une série constante', () => {
    expect(sparkPath([3, 3, 3], 10, 10)).toBe('M0.0,9.0 L5.0,9.0 L10.0,9.0');
  });
});
