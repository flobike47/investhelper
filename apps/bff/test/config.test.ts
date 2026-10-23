import { describe, expect, it } from 'vitest';
import { resolveAppUrl } from '../src/config.js';

describe('resolveAppUrl', () => {
  it('prend APP_URL, avec « / » final pour garder le BASE_PATH', () => {
    expect(resolveAppUrl('https://exemple.fr/investhelper', 'https://exemple.fr')).toBe('https://exemple.fr/investhelper/');
    expect(new URL('podcast', resolveAppUrl('https://exemple.fr/investhelper', '')).href).toBe(
      'https://exemple.fr/investhelper/podcast',
    );
  });

  it('retombe sur la première origine CORS', () => {
    expect(resolveAppUrl(undefined, 'https://app.exemple.fr, https://autre.exemple.fr')).toBe('https://app.exemple.fr/');
  });

  it('accepte CORS_ORIGIN=* en dev', () => {
    expect(resolveAppUrl(undefined, '*')).toBe('http://localhost:5173/');
  });

  it('échoue sur une URL invalide (au démarrage, pas au premier envoi)', () => {
    expect(() => resolveAppUrl('pas une url', '*')).toThrow();
  });
});
