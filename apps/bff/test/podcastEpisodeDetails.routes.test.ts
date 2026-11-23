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

const EP_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'abcdefghijklmnop';

beforeEach(() => {
  fake.seed({
    podcast_episodes: [],
    podcast_shares: [],
  });
});

const post = (body: unknown, token: 'token-a' | 'token-b' = 'token-a') =>
  app.inject({ method: 'POST', url: '/api/user/podcast/episodes', headers: auth(token), payload: body as object });

const baseEpisode = {
  date: '2026-11-23',
  categories: ['bourse'],
  script: 'Alex: Bonjour à tous, on commence par la BCE. Sophie: La BCE garde ses taux, les marchés respirent.',
  sources: ['https://n.test/bce'],
  durationEstimateSec: 120,
};

describe('POST /api/user/podcast/episodes : détails', () => {
  it('enregistre sourceDetails et topics validés', async () => {
    const res = await post({
      ...baseEpisode,
      sourceDetails: [{ url: 'https://n.test/bce', title: 'BCE', publisher: 'M', category: 'bourse', publishedAt: null }],
      topics: [{ title: 'BCE', summary: 'Taux', category: 'bourse', startRatio: 0.4 }],
    });
    expect(res.statusCode).toBe(200);

    const stored = fake.rows('podcast_episodes')[0];
    expect(stored.source_details).toEqual([
      { url: 'https://n.test/bce', title: 'BCE', publisher: 'M', category: 'bourse', publishedAt: null },
    ]);
    expect(stored.topics).toEqual([{ title: 'BCE', summary: 'Taux', category: 'bourse', startRatio: 0.4 }]);
    expect(stored.user_id).toBe(USER_A);
  });

  it('écarte les sources non http(s) et borne startRatio', async () => {
    await post({
      ...baseEpisode,
      sourceDetails: [
        { url: 'javascript:alert(1)', title: 'piège' },
        { url: 'https://n.test/ok', title: 'OK' },
      ],
      topics: [{ title: 'T', startRatio: 9 }],
    });
    const stored = fake.rows('podcast_episodes')[0];
    expect((stored.source_details as Array<{ url: string }>).map((s) => s.url)).toEqual(['https://n.test/ok']);
    expect((stored.topics as Array<{ startRatio: number }>)[0].startRatio).toBe(1);
  });

  it('stocke NULL quand le client ne fournit pas les détails (ancien client)', async () => {
    expect((await post(baseEpisode)).statusCode).toBe(200);
    const stored = fake.rows('podcast_episodes')[0];
    expect(stored.source_details).toBeNull();
    expect(stored.topics).toBeNull();
    expect(stored.sources).toEqual(['https://n.test/bce']);
  });
});

describe('GET /api/user/podcast/episodes : détails', () => {
  it("renvoie sourceDetails et topics, null pour les anciens épisodes, et seulement ceux de l'utilisateur", async () => {
    fake.seed({
      podcast_episodes: [
        {
          id: 'ep-new', user_id: USER_A, date: '2026-11-23', categories: ['bourse'], script: 's', sources: [],
          duration_estimate_sec: 60, created_at: '2026-11-23T08:00:00Z',
          source_details: [{ url: 'https://n.test/a', title: 'A', publisher: null, category: 'bourse', publishedAt: null }],
          topics: [{ title: 'T', summary: '', category: null, startRatio: 0 }],
        },
        {
          id: 'ep-old', user_id: USER_A, date: '2026-11-22', categories: ['bourse'], script: 's', sources: ['https://n.test/old'],
          duration_estimate_sec: 60, created_at: '2026-11-22T08:00:00Z', source_details: null, topics: null,
        },
        {
          id: 'ep-b', user_id: USER_B, date: '2026-11-23', categories: ['bourse'], script: 'secret', sources: [],
          duration_estimate_sec: 60, created_at: '2026-11-23T09:00:00Z', source_details: [], topics: [],
        },
      ],
    });

    const { episodes } = (await app.inject({ method: 'GET', url: '/api/user/podcast/episodes', headers: auth('token-a') })).json();
    expect(episodes.map((e: { id: string }) => e.id)).toEqual(['ep-new', 'ep-old']);
    expect(episodes[0].sourceDetails[0].url).toBe('https://n.test/a');
    expect(episodes[0].topics).toHaveLength(1);
    expect(episodes[1]).toMatchObject({ sourceDetails: null, topics: null });
  });
});

describe('GET /api/public/podcast/:token : détails', () => {
  it('renvoie sourceDetails et topics de l\'épisode partagé', async () => {
    fake.seed({
      podcast_shares: [{ token: TOKEN, episode_id: EP_ID, user_id: USER_A, expires_at: null }],
      podcast_episodes: [
        {
          id: EP_ID, user_id: USER_A, date: '2026-11-23', categories: ['bourse'], script: 'Alex: Bonjour.', sources: [],
          duration_estimate_sec: 60, created_at: '2026-11-23T08:00:00Z',
          source_details: [{ url: 'https://n.test/a', title: 'A', publisher: 'M', category: 'bourse', publishedAt: null }],
          topics: [{ title: 'Accueil', summary: 'Bonjour', category: 'bourse', startRatio: 0 }],
        },
      ],
    });
    const body = (await app.inject({ method: 'GET', url: `/api/public/podcast/${TOKEN}` })).json();
    expect(body.sourceDetails).toEqual([{ url: 'https://n.test/a', title: 'A', publisher: 'M', category: 'bourse', publishedAt: null }]);
    expect(body.topics).toEqual([{ title: 'Accueil', summary: 'Bonjour', category: 'bourse', startRatio: 0 }]);
  });

  it('renvoie null pour un épisode partagé antérieur aux détails', async () => {
    fake.seed({
      podcast_shares: [{ token: TOKEN, episode_id: EP_ID, user_id: USER_A, expires_at: null }],
      podcast_episodes: [
        {
          id: EP_ID, user_id: USER_A, date: '2026-11-23', categories: ['bourse'], script: 'Alex: Bonjour.', sources: [],
          duration_estimate_sec: 60, created_at: '2026-11-23T08:00:00Z', source_details: null, topics: null,
        },
      ],
    });
    const body = (await app.inject({ method: 'GET', url: `/api/public/podcast/${TOKEN}` })).json();
    expect(body).toMatchObject({ sourceDetails: null, topics: null });
  });
});
