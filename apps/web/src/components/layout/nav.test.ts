import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from './nav';

const active = (path: string) => NAV_ITEMS.filter((i) => i.isActive(path)).map((i) => i.label);

describe('onglet actif', () => {
  it.each([
    ['/', ['Watchlist']],
    ['/asset/NVDA', ['Watchlist']],
    ['/ideas', ['Idées']],
    // La fiche ouverte depuis les Idées reste dans l'onglet Idées
    ['/ideas/asset/NVDA', ['Idées']],
    ['/podcast', ['Podcast']],
    ['/news', ['Actualités']],
    // Réglages : accessible par l'avatar, aucun onglet actif
    ['/settings', []],
  ])('%s → %j', (path, expected) => {
    expect(active(path)).toEqual(expected);
  });
});
