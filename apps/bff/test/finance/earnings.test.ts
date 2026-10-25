import { describe, expect, it } from 'vitest';
import { earningsInWindow } from '../../src/finance/earnings.js';
import { HORIZONS } from '../../src/finance/horizons.js';

const NOW = new Date('2026-10-25T15:00:00Z');
const event = (date: string, hour = 'amc') => ({ date, hour });

describe('earningsInWindow', () => {
  it.each([
    ['le jour même', '2026-10-25', 0, true],
    ['dernier jour de la fenêtre court terme (56 j)', '2026-12-20', 56, true],
    ['juste après la fenêtre', '2026-12-21', 57, false],
  ])('court terme : %s', (_label, date, daysUntil, withinWindow) => {
    expect(earningsInWindow(event(date), HORIZONS.short, NOW)).toEqual({ date, hour: 'amc', daysUntil, withinWindow });
  });

  it('moyen terme : avertit seulement dans les 21 jours', () => {
    expect(earningsInWindow(event('2026-11-15'), HORIZONS.medium, NOW)?.withinWindow).toBe(true);
    expect(earningsInWindow(event('2026-11-16'), HORIZONS.medium, NOW)?.withinWindow).toBe(false);
  });

  it("long terme : donne la date sans jamais avertir", () => {
    expect(earningsInWindow(event('2026-10-30'), HORIZONS.long, NOW)?.withinWindow).toBe(false);
  });

  it("n'avertit pas pour une publication passée", () => {
    expect(earningsInWindow(event('2026-10-20'), HORIZONS.short, NOW)).toMatchObject({ daysUntil: -5, withinWindow: false });
  });

  it.each([
    ['aucune date', null],
    ['date illisible', event('bientôt')],
  ])('renvoie null : %s', (_label, e) => {
    expect(earningsInWindow(e, HORIZONS.short, NOW)).toBeNull();
  });
});
