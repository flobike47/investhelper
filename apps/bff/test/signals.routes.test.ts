import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_A, auth, createSupabaseFake } from './helpers.js';
import { HttpError } from '../src/validation.js';
import { candleOf, linear } from './finance/testSeries.js';

const { fake } = vi.hoisted(() => ({ fake: {} as ReturnType<typeof createSupabaseFake> }));
const m = vi.hoisted(() => ({
  cachedQuote: vi.fn(),
  cachedCandles: vi.fn(),
  cachedRecommendations: vi.fn(),
  cachedPriceTarget: vi.fn(),
  cachedFxRates: vi.fn(),
  cachedNextEarnings: vi.fn(),
}));

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/supabaseAdmin.js', async () => {
  const { createSupabaseFake } = await import('./helpers.js');
  Object.assign(fake, createSupabaseFake());
  return { supabaseAdmin: fake };
});
vi.mock('../src/marketCache.js', () => m);

let app: FastifyInstance;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());

// Série régulière : dernier cours 124,9 ; ATR = 2 ; SMA50 ≈ 122,45.
const CANDLE = { ...candleOf(linear(250, 100, 0.1)), currency: 'USD', source: 'twelvedata' };
const RECO = [{ symbol: 'AAPL', period: '2026-10-01', strongBuy: 5, buy: 5, hold: 2, sell: 0, strongSell: 0 }];

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.cachedQuote.mockResolvedValue({ c: 124.9, dp: 0.5, t: 1792785600, currency: 'USD', source: 'finnhub' });
  m.cachedCandles.mockResolvedValue(CANDLE);
  m.cachedRecommendations.mockResolvedValue(RECO);
  m.cachedPriceTarget.mockResolvedValue({ symbol: 'AAPL', lastUpdated: '', targetHigh: 160, targetLow: 110, targetMean: 140, targetMedian: 138 });
  m.cachedFxRates.mockResolvedValue({ USD: 1.25 });
  m.cachedNextEarnings.mockResolvedValue(null);
  fake.seed({ user_settings: [] });
});

/** Date UTC à `days` jours d'aujourd'hui, au format YYYY-MM-DD. */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const get = (url: string, token: 'token-a' | 'token-b' | null = 'token-a') =>
  app.inject({ method: 'GET', url, headers: token ? auth(token) : {} });

describe('GET /api/signals/:symbol', () => {
  it('renvoie 401 sans token', async () => {
    expect((await get('/api/signals/AAPL', null)).statusCode).toBe(401);
  });

  it('renvoie 400 pour un horizon inconnu', async () => {
    expect((await get('/api/signals/AAPL?horizon=decade')).statusCode).toBe(400);
  });

  it('calcule la fiche côté serveur, montants en devise native et en euros', async () => {
    const res = await get('/api/signals/AAPL?horizon=medium');
    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d).toMatchObject({ symbol: 'AAPL', horizon: 'medium', currency: 'USD', barUnit: 'séance', changePct: 0.5, errors: [] });
    expect(d.price.native).toBe(124.9);
    expect(d.price.eur).toBeCloseTo(99.92, 10);
    expect(d.signal).toBe('buy');
    expect(d.technical.rationale.length).toBeGreaterThan(0);
    expect(d.analyst).toMatchObject({ signal: 'buy', totalAnalysts: 12, targetMean: { native: 140, eur: 112 } });
    expect(d.levels.stopApplies).toBe(true);
    expect(d.levels.stop.native).toBeLessThan(d.levels.entry.native);
    expect(d.chart.c).toHaveLength(250);
    expect(d.playbook.exitConditions.join(' ')).toMatch(/€/);
    expect(m.cachedCandles).toHaveBeenCalledWith('AAPL', 'D', 365, expect.anything());
  });

  it("ne convertit pas un montant quand le taux manque (null, jamais 1)", async () => {
    m.cachedFxRates.mockRejectedValue(new Error('FX down'));
    const d = (await get('/api/signals/AAPL')).json();
    expect(d.price).toEqual({ native: 124.9, eur: null });
  });

  it('garde les montants tels quels pour une valeur cotée en euros', async () => {
    m.cachedQuote.mockResolvedValue({ c: 383, dp: -1.2, t: 1, currency: 'EUR', source: 'yahoo' });
    m.cachedCandles.mockResolvedValue({ ...CANDLE, currency: 'EUR', source: 'yahoo' });
    m.cachedFxRates.mockRejectedValue(new Error('FX down'));
    const d = (await get('/api/signals/MC.PA')).json();
    expect(d.price).toEqual({ native: 383, eur: 383 });
  });

  it("calcule le signal sans le cours et le signale dans 'errors'", async () => {
    m.cachedQuote.mockRejectedValue(new HttpError(502, 'Finnhub en panne'));
    const d = (await get('/api/signals/AAPL')).json();
    expect(d.price.native).toBeNull();
    expect(d.score).not.toBeNull();
    expect(d.errors).toEqual(['Cours indisponible : Finnhub en panne']);
  });

  it("n'affiche pas de signal sans historique de cours", async () => {
    m.cachedCandles.mockRejectedValue(new HttpError(502, 'Yahoo en panne'));
    const d = (await get('/api/signals/AAPL')).json();
    expect(d).toMatchObject({ score: null, signal: 'unknown', chart: null });
    expect(d.levels.entry.native).toBeNull();
  });

  it("renvoie l'erreur amont quand ni cours ni historique ne sont disponibles", async () => {
    m.cachedQuote.mockRejectedValue(new HttpError(502, 'down'));
    m.cachedCandles.mockRejectedValue(new HttpError(502, 'down'));
    const res = await get('/api/signals/AAPL');
    expect(res.statusCode).toBe(502);
  });

  it('signale des résultats qui tombent pendant la détention court terme', async () => {
    m.cachedNextEarnings.mockResolvedValue({ symbol: 'AAPL', date: inDays(10), hour: 'amc' });
    const d = (await get('/api/signals/AAPL?horizon=short')).json();
    expect(d.earnings).toEqual({ date: inDays(10), hour: 'amc', daysUntil: 10, withinWindow: true });
  });

  it("n'empêche pas la fiche quand la date de résultats est indisponible", async () => {
    m.cachedNextEarnings.mockRejectedValue(new Error('Yahoo 429'));
    const res = await get('/api/signals/AAPL');
    expect(res.statusCode).toBe(200);
    expect(res.json().earnings).toBeNull();
  });

  it('long terme : bougies hebdo sur 5 ans, analogue en semaines, pas de stop technique', async () => {
    m.cachedCandles.mockResolvedValue({ ...candleOf(linear(261, 100, 1)), currency: 'USD', source: 'twelvedata' });
    const d = (await get('/api/signals/AAPL?horizon=long')).json();
    expect(m.cachedCandles).toHaveBeenCalledWith('AAPL', 'W', 1825, expect.anything());
    expect(d.barUnit).toBe('semaine');
    expect(d.levels.stopApplies).toBe(false);
    expect(d.levels.stop.native).toBeNull();
  });
});

describe('taille de position dans la fiche', () => {
  it("calcule le nombre de titres avec le capital et le risque de l'utilisateur", async () => {
    fake.seed({ user_settings: [{ user_id: USER_A, capital_eur: 10_000, risk_per_trade_pct: 1 }] });
    const d = (await get('/api/signals/AAPL?horizon=short')).json();
    expect(d).toMatchObject({ capitalSet: true, riskPerTradePct: 1 });
    // Risque par titre = 2 ATR = 4 $ = 3,20 € ; 100 € / 3,20 € → 31 titres.
    expect(d.sizing.shares).toBe(31);
    expect(d.sizing.maxLossEur).toBeLessThanOrEqual(100);
  });

  it("n'utilise jamais le capital d'un autre utilisateur", async () => {
    fake.seed({ user_settings: [{ user_id: USER_A, capital_eur: 10_000, risk_per_trade_pct: 1 }] });
    const d = (await get('/api/signals/AAPL?horizon=short', 'token-b')).json();
    expect(d).toMatchObject({ capitalSet: false, sizing: null, riskPerTradePct: 1 });
  });

  it('ne calcule rien sans stop technique (long terme)', async () => {
    fake.seed({ user_settings: [{ user_id: USER_A, capital_eur: 10_000, risk_per_trade_pct: 1 }] });
    m.cachedCandles.mockResolvedValue({ ...candleOf(linear(261, 100, 1)), currency: 'USD', source: 'twelvedata' });
    const d = (await get('/api/signals/AAPL?horizon=long')).json();
    expect(d).toMatchObject({ capitalSet: true, sizing: null });
  });
});

describe('GET /api/signals/track-record', () => {
  const snap = (symbol: string, day: string, signal: string, price: number) => ({ symbol, horizon: 'short', day, signal, price, currency: 'USD' });

  it('mesure les signaux passés à partir des instantanés (route prioritaire sur /signals/:symbol)', async () => {
    fake.seed({
      user_settings: [],
      signal_snapshots: [
        snap('AAPL', '2026-01-01', 'buy', 100),
        snap('AAPL', '2026-01-31', 'buy', 110),
        snap('SPY', '2026-01-01', 'hold', 500),
        snap('SPY', '2026-01-31', 'hold', 510),
      ],
    });
    const res = await get('/api/signals/track-record?horizon=short');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ horizon: 'short', benchmark: 'SPY', since: '2026-01-01' });
    expect(body.bySignal.buy['1m'].n).toBe(1);
    expect(body.bySignal.buy['1m'].medianReturn).toBeCloseTo(0.1, 10);
    expect(m.cachedQuote).not.toHaveBeenCalled();
  });

  it('renvoie un suivi vide sans instantané', async () => {
    const body = (await get('/api/signals/track-record?horizon=long')).json();
    expect(body.since).toBeNull();
    expect(body.bySignal.sell['12m']).toMatchObject({ n: 0, significant: false });
  });
});

describe('GET /api/signals?symbols=', () => {
  it('renvoie une ligne par symbole, dans l’ordre, sans doublon', async () => {
    const res = await get('/api/signals?symbols=AAPL,msft,AAPL&horizon=short');
    expect(res.statusCode).toBe(200);
    const rows = res.json();
    expect(rows.map((r: { symbol: string }) => r.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(rows[0]).toMatchObject({ currency: 'USD', signal: expect.any(String), errors: [] });
    expect(rows[0].closes).toHaveLength(250);
  });

  it("ne fait pas échouer le lot quand un symbole est indisponible", async () => {
    m.cachedQuote.mockImplementation(async (s: string) => {
      if (s === 'ZZZZ.PA') throw new HttpError(404, 'Aucun cours disponible pour ZZZZ.PA');
      return { c: 124.9, dp: 0.5, t: 1, currency: 'USD', source: 'finnhub' };
    });
    m.cachedCandles.mockImplementation(async (s: string) => {
      if (s === 'ZZZZ.PA') throw new HttpError(404, 'Aucun historique');
      return CANDLE;
    });
    const rows = (await get('/api/signals?symbols=AAPL,ZZZZ.PA')).json();
    expect(rows[0].errors).toEqual([]);
    expect(rows[1]).toMatchObject({ symbol: 'ZZZZ.PA', score: null, signal: 'unknown', errors: ['Aucun historique'] });
  });

  it.each([
    ['sans symbole', '/api/signals'],
    ['symbole invalide', '/api/signals?symbols=AAPL,$$$'],
    ['plus de 30 symboles', `/api/signals?symbols=${Array.from({ length: 31 }, (_, i) => `S${i}`).join(',')}`],
  ])('renvoie 400 %s', async (_label, url) => {
    expect((await get(url)).statusCode).toBe(400);
  });
});
