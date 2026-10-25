import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { auth } from './helpers.js';
import { ProviderError } from '../src/providers/http.js';

const { finnhubQuote, tdCandles, yahooChart } = vi.hoisted(() => ({
  finnhubQuote: vi.fn(),
  tdCandles: vi.fn(),
  yahooChart: vi.fn(),
}));

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/supabaseAdmin.js', async () => {
  const { createSupabaseFake } = await import('./helpers.js');
  return { supabaseAdmin: createSupabaseFake() };
});
vi.mock('../src/providers/finnhub.js', () => ({ finnhub: { quote: finnhubQuote } }));
vi.mock('../src/providers/twelvedata.js', () => ({ twelvedata: { candles: tdCandles } }));
vi.mock('../src/providers/yahoo.js', () => ({ yahoo: { chart: yahooChart } }));

let app: FastifyInstance;
let redis: { flushall: () => Promise<unknown> };

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  ({ redis } = await import('../src/cache.js'));
  app = await buildServer();
});
afterAll(() => app.close());

beforeEach(async () => {
  await redis.flushall();
  finnhubQuote.mockReset();
  tdCandles.mockReset();
  yahooChart.mockReset();
});

const get = (url: string) => app.inject({ method: 'GET', url, headers: auth('token-a') });

const CANDLE = { c: [10, 11], h: [11, 12], l: [9, 10], o: [10, 11], t: [1, 2], v: [0, 0], s: 'ok' as const };
const YAHOO = { candle: CANDLE, quote: { c: 383, dp: -1.2, t: 1792769703 }, currency: 'EUR' };

describe('GET /api/quote/:symbol', () => {
  it('sert une valeur US par Finnhub, en USD', async () => {
    finnhubQuote.mockResolvedValue({ c: 347.7, dp: -0.14, t: 1792785600 });
    const res = await get('/api/quote/AAPL');
    expect(res.json()).toEqual({ c: 347.7, dp: -0.14, t: 1792785600, currency: 'USD', source: 'finnhub' });
    expect(yahooChart).not.toHaveBeenCalled();
  });

  it('sert une valeur européenne par Yahoo, sans interroger Finnhub', async () => {
    yahooChart.mockResolvedValue(YAHOO);
    const res = await get('/api/quote/MC.PA');
    expect(res.json()).toEqual({ c: 383, dp: -1.2, t: 1792769703, currency: 'EUR', source: 'yahoo' });
    expect(finnhubQuote).not.toHaveBeenCalled();
  });

  it.each([
    ['Finnhub refuse (403)', () => finnhubQuote.mockRejectedValue(new ProviderError('no access', 403, 'Finnhub'))],
    ['Finnhub ne connaît pas le symbole (cours à 0)', () => finnhubQuote.mockResolvedValue({ c: 0, dp: null, t: 0 })],
  ])('se replie sur Yahoo quand %s', async (_label, arrange) => {
    arrange();
    yahooChart.mockResolvedValue({ ...YAHOO, currency: 'USD' });
    const res = await get('/api/quote/AAPL');
    expect(res.json()).toMatchObject({ c: 383, source: 'yahoo' });
  });

  it("renvoie 404 quand aucune source n'a de cours", async () => {
    yahooChart.mockResolvedValue(null);
    const res = await get('/api/quote/ZZZZ.PA');
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/candles/:symbol', () => {
  it('sert une valeur US par Twelve Data', async () => {
    tdCandles.mockResolvedValue({ ...CANDLE, currency: 'USD' });
    const res = await get('/api/candles/AAPL?resolution=D&lookbackDays=120');
    expect(res.json()).toMatchObject({ c: [10, 11], currency: 'USD', source: 'twelvedata' });
  });

  it('sert une valeur européenne par Yahoo avec le nombre de bougies demandé', async () => {
    yahooChart.mockResolvedValue(YAHOO);
    const res = await get('/api/candles/MC.PA?resolution=W&lookbackDays=1825');
    expect(res.json()).toMatchObject({ c: [10, 11], currency: 'EUR', source: 'yahoo' });
    expect(yahooChart).toHaveBeenCalledWith('MC.PA', 'W', 261);
    expect(tdCandles).not.toHaveBeenCalled();
  });

  it('se replie sur Yahoo quand Twelve Data réserve le symbole au plan payant', async () => {
    tdCandles.mockRejectedValue(new ProviderError('available starting with the Grow plan', 404, 'Twelve Data'));
    yahooChart.mockResolvedValue({ ...YAHOO, currency: 'USD' });
    const res = await get('/api/candles/AAPL?resolution=D&lookbackDays=120');
    expect(res.json()).toMatchObject({ source: 'yahoo', currency: 'USD' });
  });

  it("renvoie un historique vide (no_data) quand aucune source n'en a", async () => {
    yahooChart.mockResolvedValue(null);
    const res = await get('/api/candles/ZZZZ.PA');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ s: 'no_data', c: [] });
  });

  it('propage une panne Yahoo en erreur propre plutôt que de mettre en cache un vide', async () => {
    yahooChart.mockRejectedValue(new ProviderError('Yahoo HTTP 503', 502, 'Yahoo'));
    const res = await get('/api/candles/MC.PA');
    expect(res.statusCode).toBe(502);
    expect(Object.keys(res.json()).sort()).toEqual(['error', 'reqId']);
  });
});
