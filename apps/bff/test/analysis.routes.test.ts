import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_A, auth } from './helpers.js';

const { companyNews, geminiJson } = vi.hoisted(() => ({
  companyNews: vi.fn(),
  geminiJson: vi.fn(),
}));

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/supabaseAdmin.js', async () => {
  const { createSupabaseFake } = await import('./helpers.js');
  return { supabaseAdmin: createSupabaseFake() };
});
vi.mock('../src/providers/finnhub.js', () => ({
  finnhub: { companyNews },
}));
vi.mock('../src/providers/gemini.js', () => ({
  gemini: { json: geminiJson, text: vi.fn(), ttsMultiSpeaker: vi.fn() },
}));

let app: FastifyInstance;
let redis: { flushall: () => Promise<unknown>; get: (k: string) => Promise<string | null> };

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  ({ redis } = await import('../src/cache.js'));
  app = await buildServer();
});
afterAll(() => app.close());

beforeEach(async () => {
  await redis.flushall();
  companyNews.mockReset();
  geminiJson.mockReset();
});

const sentimentOf = (symbol: string) =>
  app.inject({ method: 'GET', url: `/api/analysis/sentiment/${symbol}`, headers: auth('token-a') });

describe('GET /api/analysis/sentiment/:symbol', () => {
  it('renvoie 401 sans token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analysis/sentiment/AAPL' });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['aucune actualité', []],
    ['endpoint news inaccessible (plan gratuit)', null],
  ])("renvoie 'unknown' et non « neutre » quand il n'y a pas d'actualité : %s", async (_label, news) => {
    companyNews.mockResolvedValue(news);
    const res = await sentimentOf('MC.PA');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sentiment: 'unknown', score: null, drivers: [] });
    expect(geminiJson).not.toHaveBeenCalled();
  });

  it("ne décompte pas le quota d'analyse IA quand Gemini n'est pas appelé", async () => {
    companyNews.mockResolvedValue([]);
    await sentimentOf('MC.PA');
    expect(await redis.get(`quota:sentiment:${USER_A}`)).toBeNull();
  });

  it("analyse les titres avec Gemini et décompte le quota quand il y a de l'actualité", async () => {
    companyNews.mockResolvedValue([{ headline: 'Apple bat les attentes' }]);
    geminiJson.mockResolvedValue({ sentiment: 'positive', score: 0.6, drivers: ['résultats'], summary: 'Bons résultats.' });
    const res = await sentimentOf('AAPL');
    expect(res.json()).toMatchObject({ sentiment: 'positive', score: 0.6 });
    expect(geminiJson).toHaveBeenCalledOnce();
    expect(await redis.get(`quota:sentiment:${USER_A}`)).toBe('1');
  });
});
