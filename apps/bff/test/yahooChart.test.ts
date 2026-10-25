import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosGet } = vi.hoisted(() => ({ axiosGet: vi.fn() }));

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, get: axiosGet } };
});

/** Réponses réelles de /v8/finance/chart, réduites à 5 bougies (test/fixtures/yahoo). */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/yahoo/${name}`, import.meta.url), 'utf8'));

function yahooAnswers(status: number, data: unknown) {
  axiosGet.mockResolvedValue({ status, headers: {}, data });
}

describe('yahoo.chart', () => {
  beforeEach(async () => {
    axiosGet.mockReset();
    const { redis } = await import('../src/cache.js');
    await redis.flushall();
  });

  it('normalise les bougies et ignore une bougie vide (jour férié)', async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooAnswers(200, fixture('chart-mc-pa.json'));
    const res = await yahoo.chart('MC.PA', 'D', 120);
    expect(res?.currency).toBe('EUR');
    expect(res?.candle.s).toBe('ok');
    expect(res?.candle.c).toHaveLength(4); // 5 bougies dont une vide
    expect(res?.candle.c.every((c) => Number.isFinite(c) && c > 0)).toBe(true);
    expect(res?.candle.t).toEqual([...res!.candle.t].sort((a, b) => a - b));
  });

  it('donne le cours, sa variation du jour et son horodatage', async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooAnswers(200, fixture('chart-mc-pa.json'));
    const res = await yahoo.chart('MC.PA', 'D', 5);
    expect(res?.quote).toEqual({ c: 383, dp: -1.238, t: 1792769703 });
  });

  it('convertit les pence (GBp) en livres', async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooAnswers(200, fixture('chart-bp-l-gbp.json'));
    const res = await yahoo.chart('BP.L', 'D', 120);
    expect(res?.currency).toBe('GBP');
    expect(res?.quote.c).toBeCloseTo(6.385, 10);
    expect(res?.quote.dp).toBe(4.347); // un pourcentage ne change pas d'unité
    expect(res?.candle.c.at(-1)).toBeCloseTo(6.385, 10);
  });

  it('garde au plus le nombre de bougies demandé (les plus récentes)', async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooAnswers(200, fixture('chart-mc-pa.json'));
    const res = await yahoo.chart('MC.PA', 'D', 2);
    expect(res?.candle.c).toEqual([387.8, 383]);
  });

  it.each([
    ['symbole inconnu', 404, fixture('chart-not-found.json')],
    ['réponse sans résultat', 200, { chart: { result: [], error: null } }],
  ])('renvoie null : %s', async (_label, status, data) => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooAnswers(status, data);
    expect(await yahoo.chart('ZZZZ.PA', 'D', 5)).toBeNull();
  });

  it('lève une erreur de provider sur une panne amont', async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooAnswers(503, 'Service Unavailable');
    await expect(yahoo.chart('MC.PA', 'D', 5)).rejects.toMatchObject({ provider: 'Yahoo', status: 502 });
  });

  it('se met en pause après un 429 et le signale comme une panne, sans renvoyer de vide', async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooAnswers(429, 'Too Many Requests');
    await expect(yahoo.chart('MC.PA', 'D', 5)).rejects.toMatchObject({ status: 503 });
    axiosGet.mockClear();
    await expect(yahoo.chart('SAP.DE', 'D', 5)).rejects.toMatchObject({ status: 503 });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('demande la syntaxe Yahoo pour les classes d’actions US (BRK.B → BRK-B)', async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooAnswers(200, fixture('chart-mc-pa.json'));
    await yahoo.chart('BRK.B', 'D', 5);
    expect(axiosGet.mock.calls[0][0]).toContain('/v8/finance/chart/BRK-B');
  });

  it.each(['BP.L', '7203.T', 'SHOP.TO'])('garde tel quel un suffixe de place (%s)', async (symbol) => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooAnswers(200, fixture('chart-bp-l-gbp.json'));
    await yahoo.chart(symbol, 'D', 5);
    expect(axiosGet.mock.calls[0][0]).toContain(`/v8/finance/chart/${encodeURIComponent(symbol)}`);
  });
});
