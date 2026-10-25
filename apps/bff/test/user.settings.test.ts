import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_A, USER_B, auth, createSupabaseFake } from './helpers.js';

const { fake } = vi.hoisted(() => ({ fake: {} as ReturnType<typeof createSupabaseFake> }));

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/supabaseAdmin.js', async () => {
  const { createSupabaseFake } = await import('./helpers.js');
  Object.assign(fake, createSupabaseFake());
  return { supabaseAdmin: fake };
});

let app: FastifyInstance;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());

beforeEach(() => {
  fake.seed({ user_settings: [{ user_id: USER_B, capital_eur: 50_000, risk_per_trade_pct: 2 }] });
});

const put = (payload: unknown) =>
  app.inject({ method: 'PUT', url: '/api/user/settings', headers: auth('token-a'), payload: payload as object });
const getSettings = (token: 'token-a' | 'token-b' = 'token-a') =>
  app.inject({ method: 'GET', url: '/api/user/settings', headers: auth(token) });

describe('réglages de taille de position', () => {
  it('renvoie capital absent et risque de 1 % par défaut', async () => {
    expect((await getSettings()).json()).toMatchObject({ capitalEur: null, riskPerTradePct: 1 });
  });

  it('enregistre le capital et le risque, arrondis au centième', async () => {
    expect((await put({ capitalEur: 12_345.678, riskPerTradePct: 0.5 })).statusCode).toBe(200);
    expect((await getSettings()).json()).toMatchObject({ capitalEur: 12_345.68, riskPerTradePct: 0.5 });
  });

  it('efface le capital avec null', async () => {
    await put({ capitalEur: 10_000 });
    await put({ capitalEur: null });
    expect((await getSettings()).json().capitalEur).toBeNull();
  });

  it.each([
    ['capital nul', { capitalEur: 0 }],
    ['capital négatif', { capitalEur: -10 }],
    ['capital non numérique', { capitalEur: '10000' }],
    ['risque nul', { riskPerTradePct: 0 }],
    ['risque au-delà de 5 %', { riskPerTradePct: 6 }],
  ])('refuse %s (400)', async (_label, payload) => {
    expect((await put(payload)).statusCode).toBe(400);
  });

  it("ne touche pas aux réglages d'un autre utilisateur", async () => {
    await put({ capitalEur: 1_000 });
    expect((await getSettings('token-b')).json()).toMatchObject({ capitalEur: 50_000, riskPerTradePct: 2 });
    expect(fake.rows('user_settings').find((r) => r.user_id === USER_A)).toMatchObject({ capital_eur: 1_000 });
  });
});
