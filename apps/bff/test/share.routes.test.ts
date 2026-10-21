import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_A, auth, createSupabaseFake } from './helpers.js';

const { fake, ttsMock } = vi.hoisted(() => ({
  fake: {} as ReturnType<typeof createSupabaseFake>,
  ttsMock: vi.fn(async (_text: string, _speakers: Record<string, string>) => Buffer.from([1, 0, 2, 0])),
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
vi.mock('../src/providers/gemini.js', () => ({
  gemini: { ttsMultiSpeaker: ttsMock, text: vi.fn(), json: vi.fn() },
}));

const EP_ID = '33333333-3333-4333-8333-333333333333';
const SCRIPT = 'Alex: Bonjour et bienvenue.\nSophie: Merci Alex, on parle du CAC 40.';
const SHARE_TOKEN = 'AbCdEfGh12345678';

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
  ttsMock.mockClear();
  fake.seed({
    podcast_episodes: [
      {
        id: EP_ID,
        user_id: USER_A,
        date: '2026-10-21',
        categories: ['bourse'],
        script: SCRIPT,
        sources: [],
        duration_estimate_sec: 60,
        created_at: '2026-10-21T08:00:00Z',
      },
    ],
    podcast_shares: [
      { token: SHARE_TOKEN, episode_id: EP_ID, user_id: USER_A, created_at: '2026-10-21T09:00:00Z', expires_at: null },
    ],
  });
});

describe('format des erreurs', () => {
  // Régression : le setErrorHandler était déclaré après les routes et ne
  // s'appliquait à aucune d'elles.
  it.each([
    ['GET', '/api/public/podcast/a$b', 400],
    ['GET', '/api/public/podcast/Unknown123456789', 404],
    ['GET', '/route/inexistante', 404],
  ] as const)('%s %s → { error, reqId } avec %i', async (method, url, status) => {
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(status);
    expect(Object.keys(res.json()).sort()).toEqual(['error', 'reqId']);
  });
});

describe('GET /api/public/podcast/:token', () => {
  it("renvoie l'épisode et le nombre de chunks TTS sans authentification", async () => {
    const res = await app.inject({ method: 'GET', url: `/api/public/podcast/${SHARE_TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: EP_ID, script: SCRIPT, ttsChunkCount: 1 });
  });

  it('renvoie 404 pour un token inconnu', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/public/podcast/Unknown123456789' });
    expect(res.statusCode).toBe(404);
  });

  it('renvoie 410 pour un lien expiré', async () => {
    fake.rows('podcast_shares')[0].expires_at = '2020-01-01T00:00:00Z';
    const res = await app.inject({ method: 'GET', url: `/api/public/podcast/${SHARE_TOKEN}` });
    expect(res.statusCode).toBe(410);
  });

  it('renvoie 400 pour un token mal formé', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/public/podcast/a$b' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/public/podcast/:token/tts', () => {
  const url = `/api/public/podcast/${SHARE_TOKEN}/tts`;

  it("synthétise le chunk demandé à partir du script de l'épisode", async () => {
    const res = await app.inject({ method: 'POST', url, payload: { chunkIndex: 0 } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('audio/L16');
    expect(ttsMock).toHaveBeenCalledWith(
      'Alex: Bonjour et bienvenue.\nSophie: Merci Alex, on parle du CAC 40.',
      { Alex: 'Charon', Sophie: 'Kore' },
    );
  });

  it("refuse un texte libre : un lien de partage n'est pas un proxy TTS", async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      payload: { text: 'Alex: texte arbitraire', speakers: { Alex: 'Puck' } },
    });
    expect(res.statusCode).toBe(400);
    expect(ttsMock).not.toHaveBeenCalled();
  });

  it.each([-1, 1, 1.5, '0'])('refuse un chunkIndex invalide (%s)', async (chunkIndex) => {
    const res = await app.inject({ method: 'POST', url, payload: { chunkIndex } });
    expect(res.statusCode).toBe(400);
    expect(ttsMock).not.toHaveBeenCalled();
  });

  it("sert depuis le cache sans rappeler Gemini à la seconde écoute", async () => {
    await app.inject({ method: 'POST', url, payload: { chunkIndex: 0 } });
    await app.inject({ method: 'POST', url, payload: { chunkIndex: 0 } });
    expect(ttsMock).toHaveBeenCalledTimes(1);
  });

  it('renvoie 404 quand le partage a été révoqué', async () => {
    fake.seed({ podcast_episodes: fake.rows('podcast_episodes'), podcast_shares: [] });
    const res = await app.inject({ method: 'POST', url, payload: { chunkIndex: 0 } });
    expect(res.statusCode).toBe(404);
    expect(ttsMock).not.toHaveBeenCalled();
  });
});

describe('routes owner /api/user/podcast/episodes/:id/share', () => {
  const url = `/api/user/podcast/episodes/${EP_ID}/share`;

  it('renvoie 401 sans token (et non 400)', async () => {
    const res = await app.inject({ method: 'POST', url });
    expect(res.statusCode).toBe(401);
  });

  it('renvoie 400 pour un id qui n’est pas un UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/podcast/episodes/not-a-uuid/share',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('est idempotent : renvoie le partage existant', async () => {
    const res = await app.inject({ method: 'POST', url, headers: auth('token-a') });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBe(SHARE_TOKEN);
    expect(fake.rows('podcast_shares')).toHaveLength(1);
  });

  it('crée un token de 16 caractères base62 quand aucun partage n’existe', async () => {
    fake.seed({ podcast_episodes: fake.rows('podcast_episodes'), podcast_shares: [] });
    const res = await app.inject({ method: 'POST', url, headers: auth('token-a') });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it("renvoie 404 quand l'épisode appartient à un autre user", async () => {
    const res = await app.inject({ method: 'POST', url, headers: auth('token-b') });
    expect(res.statusCode).toBe(404);
    expect(fake.rows('podcast_shares').every((s) => s.user_id === USER_A)).toBe(true);
  });

  it("ne révoque pas le partage d'un autre user", async () => {
    const res = await app.inject({ method: 'DELETE', url, headers: auth('token-b') });
    expect(res.statusCode).toBe(200);
    expect(fake.rows('podcast_shares')).toHaveLength(1);
  });
});
