import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { auth } from './helpers.js';
import { HttpError } from '../src/validation.js';
import { candleOf, linear } from './finance/testSeries.js';

const { getMarketThemes, m } = vi.hoisted(() => ({
  getMarketThemes: vi.fn(),
  m: {
    cachedQuote: vi.fn(),
    cachedCandles: vi.fn(),
    cachedRecommendations: vi.fn(),
    cachedPriceTarget: vi.fn(),
    cachedFxRates: vi.fn(),
    cachedNextEarnings: vi.fn(),
  },
}));

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/supabaseAdmin.js', async () => {
  const { createSupabaseFake } = await import('./helpers.js');
  return { supabaseAdmin: createSupabaseFake() };
});
vi.mock('../src/themes.js', () => ({ getMarketThemes }));
vi.mock('../src/marketCache.js', () => m);

let app: FastifyInstance;
beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());

beforeEach(() => {
  for (const fn of [getMarketThemes, ...Object.values(m)]) fn.mockReset();
  getMarketThemes.mockResolvedValue({
    themes: [{ name: 'Défense européenne', direction: 'bullish', sectors: ['defense'], summary: 'Budgets en hausse.' }],
  });
  m.cachedQuote.mockResolvedValue({ c: 124.9, dp: 0.5, t: 1, currency: 'USD', source: 'finnhub' });
  m.cachedCandles.mockResolvedValue({ ...candleOf(linear(250, 100, 0.1)), currency: 'USD', source: 'twelvedata' });
  m.cachedRecommendations.mockResolvedValue(null);
  m.cachedPriceTarget.mockResolvedValue(null);
  m.cachedFxRates.mockResolvedValue({ USD: 1.25 });
  m.cachedNextEarnings.mockResolvedValue(null);
});

const get = (url: string) => app.inject({ method: 'GET', url, headers: auth('token-a') });

describe('GET /api/ideas', () => {
  it('renvoie les thèmes et les titres exposés, classés, avec leur nom', async () => {
    const res = await get('/api/ideas?horizon=medium');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.themes[0].name).toBe('Défense européenne');
    expect(body.picks.length).toBeGreaterThan(0);
    expect(body.picks.length).toBeLessThanOrEqual(5);
    expect(body.picks[0]).toMatchObject({ themes: ['Défense européenne'], themeBias: 1, name: expect.any(String) });
    expect(body.picks[0].row).toMatchObject({ currency: 'USD', errors: [] });
  });

  it('signale les candidats sans score au lieu de les taire', async () => {
    m.cachedCandles.mockRejectedValue(new HttpError(502, 'Yahoo en panne'));
    m.cachedQuote.mockRejectedValue(new HttpError(502, 'Yahoo en panne'));
    const body = (await get('/api/ideas')).json();
    expect(body.picks).toEqual([]);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0].error).toMatch(/Yahoo en panne/);
  });

  it('renvoie 400 pour un horizon inconnu', async () => {
    expect((await get('/api/ideas?horizon=decade')).statusCode).toBe(400);
  });
});
