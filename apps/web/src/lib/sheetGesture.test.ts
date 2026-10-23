import { describe, expect, it } from 'vitest';
import { projectOffset, releaseVelocity, shouldDismiss } from './sheetGesture';

const HEIGHT = 800;

describe('releaseVelocity', () => {
  it('mesure la vitesse sur les 100 dernières ms', () => {
    // Rapide au début (1 px/ms), plus lent à la fin : seule la fin compte
    const samples = [
      { y: 0, t: 0 },
      { y: 200, t: 200 },
      { y: 210, t: 250 },
      { y: 230, t: 300 },
    ];
    expect(releaseVelocity(samples)).toBeCloseTo(30 / 100);
  });

  it('vaut 0 quand le doigt s\'est arrêté avant de lâcher', () => {
    expect(releaseVelocity([{ y: 0, t: 0 }, { y: 300, t: 100 }, { y: 300, t: 400 }])).toBe(0);
  });

  it('vaut 0 sans échantillon ou avec un seul', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ y: 40, t: 10 }])).toBe(0);
  });

  it('est négative quand le doigt remonte', () => {
    expect(releaseVelocity([{ y: 100, t: 0 }, { y: 50, t: 50 }])).toBeLessThan(0);
  });
});

describe('projectOffset', () => {
  it("ajoute l'élan à la position", () => {
    expect(projectOffset(100, 0)).toBe(100);
    expect(projectOffset(100, 1)).toBeCloseTo(100 + 499);
  });
});

describe('shouldDismiss', () => {
  it('reste ouvert après un petit glissé lent', () => {
    expect(shouldDismiss({ offset: 80, velocity: 0.1, height: HEIGHT })).toBe(false);
  });

  it("ferme au-delà d'un quart de la hauteur, même lâché sans élan", () => {
    expect(shouldDismiss({ offset: 260, velocity: 0, height: HEIGHT })).toBe(true);
  });

  it('ferme sur un petit glissé rapide (flick)', () => {
    expect(shouldDismiss({ offset: 40, velocity: 1.2, height: HEIGHT })).toBe(true);
  });

  it('reste ouvert quand le doigt remonte au lâcher', () => {
    expect(shouldDismiss({ offset: 400, velocity: -0.5, height: HEIGHT })).toBe(false);
  });

  it('reste ouvert sur un tremblé de quelques pixels, même vif', () => {
    expect(shouldDismiss({ offset: 4, velocity: 1.5, height: HEIGHT })).toBe(false);
  });

  it('reste ouvert sans hauteur mesurée', () => {
    expect(shouldDismiss({ offset: 400, velocity: 1, height: 0 })).toBe(false);
  });
});
