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

/** Réponses Yahoo simulées : session (cookie + crumb) puis quoteSummary. */
function yahooReturns(financialData: Record<string, { raw: number }>) {
  axiosGet.mockImplementation(async (url: string) => {
    if (url === 'https://fc.yahoo.com') return { status: 404, headers: { 'set-cookie': ['A3=x; Path=/'] }, data: '' };
    if (url.includes('/getcrumb')) return { status: 200, headers: {}, data: 'crumb' };
    return { status: 200, headers: {}, data: { quoteSummary: { result: [{ financialData }], error: null } } };
  });
}

describe('yahoo.priceTarget', () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it('renvoie null pour les objectifs absents au lieu de 0', async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooReturns({ targetHighPrice: { raw: 150 } });
    expect(await yahoo.priceTarget('AAPL')).toMatchObject({
      targetHigh: 150,
      targetLow: null,
      targetMean: null,
      targetMedian: null,
    });
  });

  it('se rabat sur la médiane quand la moyenne manque, et inversement', async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooReturns({ targetMedianPrice: { raw: 120 } });
    expect(await yahoo.priceTarget('MSFT')).toMatchObject({ targetMean: 120, targetMedian: 120 });
  });

  it("renvoie null quand Yahoo n'a aucun objectif", async () => {
    const { yahoo } = await import('../src/providers/yahoo.js');
    yahooReturns({});
    expect(await yahoo.priceTarget('NVDA')).toBeNull();
  });
});
