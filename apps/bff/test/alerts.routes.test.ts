import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_A, USER_B, auth, createSupabaseFake } from './helpers.js';

const { fake, cachedQuote } = vi.hoisted(() => ({
  fake: {} as ReturnType<typeof createSupabaseFake>,
  cachedQuote: vi.fn(),
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
vi.mock('../src/marketCache.js', () => ({ cachedQuote }));

let app: FastifyInstance;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());

const B_ALERT = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  cachedQuote.mockReset();
  cachedQuote.mockResolvedValue({ c: 383, dp: -1.2, t: 1, currency: 'EUR', source: 'yahoo' });
  fake.seed({
    price_alerts: [
      { id: B_ALERT, user_id: USER_B, symbol: 'MC.PA', direction: 'below', threshold: 350, currency: 'EUR', kind: 'stop', created_at: '2026-10-24T10:00:00Z', triggered_at: null, triggered_price: null },
    ],
  });
});

const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object, token: 'token-a' | 'token-b' | null = 'token-a') =>
  app.inject({ method, url, payload, headers: token ? auth(token) : {} });

describe('POST /api/user/alerts', () => {
  it('crée une alerte dans la devise du cours', async () => {
    const res = await call('POST', '/api/user/alerts', { symbol: 'mc.pa', direction: 'below', threshold: 360, kind: 'stop' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ symbol: 'MC.PA', direction: 'below', threshold: 360, currency: 'EUR', kind: 'stop', triggeredAt: null });
    expect(fake.rows('price_alerts').find((r) => r.user_id === USER_A)).toMatchObject({ symbol: 'MC.PA', currency: 'EUR' });
  });

  it.each([
    ['au-dessus alors que le cours est déjà plus haut', { symbol: 'MC.PA', direction: 'above', threshold: 380 }],
    ['en dessous alors que le cours est déjà plus bas', { symbol: 'MC.PA', direction: 'below', threshold: 390 }],
  ])('refuse une alerte déjà franchie : %s', async (_label, payload) => {
    const res = await call('POST', '/api/user/alerts', payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/déjà/);
  });

  it.each([
    ['direction inconnue', { symbol: 'MC.PA', direction: 'up', threshold: 400 }],
    ['seuil négatif', { symbol: 'MC.PA', direction: 'above', threshold: -1 }],
    ['seuil non numérique', { symbol: 'MC.PA', direction: 'above', threshold: '400' }],
    ['symbole invalide', { symbol: '$$$', direction: 'above', threshold: 400 }],
  ])('renvoie 400 : %s', async (_label, payload) => {
    expect((await call('POST', '/api/user/alerts', payload)).statusCode).toBe(400);
  });

  it('renvoie 409 quand la limite de 50 alertes actives est atteinte (trigger)', async () => {
    fake.failNextWrite('price_alerts', { code: 'P0001', message: 'price_alerts_limit', details: 'Limite de 50 alertes actives atteinte' });
    const res = await call('POST', '/api/user/alerts', { symbol: 'MC.PA', direction: 'above', threshold: 400 });
    expect(res.statusCode).toBe(409);
  });

  it('renvoie 401 sans token', async () => {
    expect((await call('POST', '/api/user/alerts', { symbol: 'MC.PA', direction: 'above', threshold: 400 }, null)).statusCode).toBe(401);
  });
});

describe('GET /api/user/alerts', () => {
  it("ne liste que les alertes de l'utilisateur", async () => {
    await call('POST', '/api/user/alerts', { symbol: 'MC.PA', direction: 'above', threshold: 400 });
    const { alerts } = (await call('GET', '/api/user/alerts?symbol=MC.PA')).json();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ threshold: 400, direction: 'above' });
  });
});

describe('DELETE /api/user/alerts/:id', () => {
  it("renvoie 404 pour l'alerte d'un autre utilisateur, sans la supprimer", async () => {
    const res = await call('DELETE', `/api/user/alerts/${B_ALERT}`);
    expect(res.statusCode).toBe(404);
    expect(fake.rows('price_alerts')).toHaveLength(1);
  });

  it('supprime sa propre alerte', async () => {
    expect((await call('DELETE', `/api/user/alerts/${B_ALERT}`, undefined, 'token-b')).statusCode).toBe(200);
    expect(fake.rows('price_alerts')).toHaveLength(0);
  });

  it('renvoie 400 pour un identifiant invalide', async () => {
    expect((await call('DELETE', '/api/user/alerts/pas-un-uuid')).statusCode).toBe(400);
  });
});
