import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

const { redis } = await import('../src/cache.js');
const { QUOTAS, QuotaExceeded, enforceQuota, readQuota } = await import('../src/ratelimit.js');

beforeEach(async () => {
  await redis.flushall();
});

describe('enforceQuota', () => {
  it('pose un TTL dès le premier appel (la clé ne peut pas devenir permanente)', async () => {
    await enforceQuota('user-1', 'podcastScript');
    const ttl = await redis.ttl('quota:podcastScript:user-1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(QUOTAS.podcastScript.windowSec);
  });

  it('répare une clé existante restée sans TTL (quota bloqué à vie)', async () => {
    await redis.set('quota:podcastScript:user-1', String(QUOTAS.podcastScript.max + 5));
    await enforceQuota('user-1', 'podcastScript').catch(() => undefined);
    expect(await redis.ttl('quota:podcastScript:user-1')).toBeGreaterThan(0);
  });

  it('ne repousse pas la fenêtre aux appels suivants', async () => {
    await enforceQuota('user-1', 'podcastScript');
    await redis.expire('quota:podcastScript:user-1', 100);
    await enforceQuota('user-1', 'podcastScript');
    expect(await redis.ttl('quota:podcastScript:user-1')).toBeLessThanOrEqual(100);
  });

  it('autorise exactement `max` appels puis lève QuotaExceeded (429)', async () => {
    const { max } = QUOTAS.podcastScript;
    for (let i = 0; i < max; i++) await enforceQuota('user-1', 'podcastScript');
    const err = await enforceQuota('user-1', 'podcastScript').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuotaExceeded);
    expect((err as InstanceType<typeof QuotaExceeded>).statusCode).toBe(429);
  });

  it('isole les compteurs par sujet', async () => {
    const { max } = QUOTAS.podcastScript;
    for (let i = 0; i < max; i++) await enforceQuota('user-1', 'podcastScript');
    await expect(enforceQuota('user-2', 'podcastScript')).resolves.toBeUndefined();
  });

  it('laisse passer quand Redis est indisponible', async () => {
    vi.spyOn(redis, 'multi').mockImplementation(() => {
      throw new Error('ECONNREFUSED');
    });
    await expect(enforceQuota('user-1', 'podcastScript')).resolves.toBeUndefined();
  });
});

describe('readQuota', () => {
  it('reflète la consommation', async () => {
    await enforceQuota('user-1', 'themes');
    await enforceQuota('user-1', 'themes');
    expect(await readQuota('user-1', 'themes')).toMatchObject({
      used: 2,
      remaining: QUOTAS.themes.max - 2,
    });
  });
});
