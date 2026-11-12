import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { auth, createSupabaseFake } from './helpers.js';

const { ttsMock } = vi.hoisted(() => ({
  ttsMock: vi.fn(async (_text: string, _speakers: Record<string, string>) => Buffer.from([1, 0, 2, 0])),
}));

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/supabaseAdmin.js', () => ({ supabaseAdmin: createSupabaseFake() }));
vi.mock('../src/providers/gemini.js', () => ({
  gemini: { ttsMultiSpeaker: ttsMock, text: vi.fn(), json: vi.fn() },
}));

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
});

describe('POST /api/podcast/tts', () => {
  const payload = { text: 'Alex: Bonjour.\nSophie: Salut.', speakers: { Alex: 'Charon', Sophie: 'Kore' } };

  it('renvoie le PCM et le met en cache pour les lectures suivantes', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/podcast/tts', headers: auth('token-a'), payload });
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-audio-sample-rate']).toBe('24000');
    expect(first.rawPayload).toEqual(Buffer.from([1, 0, 2, 0]));

    const second = await app.inject({ method: 'POST', url: '/api/podcast/tts', headers: auth('token-a'), payload });
    expect(second.rawPayload).toEqual(Buffer.from([1, 0, 2, 0]));
    expect(ttsMock).toHaveBeenCalledTimes(1);
    expect(ttsMock).toHaveBeenCalledWith(payload.text, payload.speakers);
  });

  it('exige un utilisateur connecté', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/podcast/tts', payload });
    expect(res.statusCode).toBe(401);
    expect(ttsMock).not.toHaveBeenCalled();
  });
});
