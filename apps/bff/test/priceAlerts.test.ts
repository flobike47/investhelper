import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { USER_A, USER_B, createSupabaseFake } from './helpers.js';
import type { MarketQuote } from '../src/types.js';

const { fake, sendMock } = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = 'test-vapid-public';
  process.env.VAPID_PRIVATE_KEY = 'test-vapid-private';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  return {
    fake: {} as ReturnType<typeof createSupabaseFake>,
    sendMock: vi.fn(async (..._args: unknown[]) => ({ statusCode: 201 })),
  };
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/supabaseAdmin.js', async () => {
  const { createSupabaseFake } = await import('./helpers.js');
  Object.assign(fake, createSupabaseFake());
  return { supabaseAdmin: fake };
});
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: sendMock } }));

const { runPriceAlertsTick } = await import('../src/jobs/priceAlerts.js');
const { redis } = await import('../src/cache.js');

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;
const NOW = new Date('2026-10-25T15:00:00Z');
const APPLE = 'https://web.push.apple.com/device-a';

const alert = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  user_id: USER_A,
  symbol: 'AAPL',
  direction: 'below',
  threshold: 330,
  currency: 'USD',
  kind: 'stop',
  triggered_at: null,
  ...extra,
});
const quoteAt = (c: number, currency = 'USD') => vi.fn(async (): Promise<MarketQuote> => ({ c, dp: 0, t: 1, currency, source: 'finnhub' }));
const sub = (userId: string) => ({ id: `sub-${userId}`, user_id: userId, endpoint: APPLE, p256dh: 'p', auth: 'a' });
const pushedTitles = () => sendMock.mock.calls.map((c) => JSON.parse(c[1] as string).notification.title);

beforeEach(async () => {
  await redis.flushall();
  sendMock.mockClear();
  fake.seed({ price_alerts: [], push_subscriptions: [sub(USER_A), sub(USER_B)] });
});

describe('runPriceAlertsTick', () => {
  it.each([
    ['stop touché (sous le seuil)', alert('a1'), 325, /^AAPL est passé sous 330,00\s\$US$/],
    ['objectif atteint (au-dessus)', alert('a1', { direction: 'above', threshold: 360, kind: 'target' }), 361, /^AAPL a dépassé 360,00\s\$US$/],
  ])('notifie quand le seuil est franchi : %s', async (_label, a, price, title) => {
    fake.seed({ price_alerts: [a], push_subscriptions: [sub(USER_A)] });
    await runPriceAlertsTick(log, NOW, quoteAt(price));
    expect(pushedTitles()).toHaveLength(1);
    expect(pushedTitles()[0]).toMatch(title);
    expect(fake.rows('price_alerts')[0]).toMatchObject({ triggered_at: NOW.toISOString(), triggered_price: price });
  });

  it("ne notifie pas tant que le seuil n'est pas franchi", async () => {
    fake.seed({ price_alerts: [alert('a1')], push_subscriptions: [sub(USER_A)] });
    await runPriceAlertsTick(log, NOW, quoteAt(331));
    expect(sendMock).not.toHaveBeenCalled();
    expect(fake.rows('price_alerts')[0].triggered_at).toBeNull();
  });

  it("n'envoie qu'une fois : une alerte déclenchée n'est plus surveillée", async () => {
    fake.seed({ price_alerts: [alert('a1')], push_subscriptions: [sub(USER_A)] });
    await runPriceAlertsTick(log, NOW, quoteAt(325));
    await redis.flushall(); // passage suivant, verrou expiré
    await runPriceAlertsTick(log, new Date(NOW.getTime() + 300_000), quoteAt(320));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('ne fait qu’un passage à la fois (verrou), même lancé deux fois en parallèle', async () => {
    fake.seed({ price_alerts: [alert('a1')], push_subscriptions: [sub(USER_A)] });
    await Promise.all([runPriceAlertsTick(log, NOW, quoteAt(325)), runPriceAlertsTick(log, NOW, quoteAt(325))]);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('demande un seul cours par symbole et notifie chaque utilisateur concerné', async () => {
    const getQuote = quoteAt(325);
    fake.seed({
      price_alerts: [alert('a1'), alert('b1', { user_id: USER_B, threshold: 328 })],
      push_subscriptions: [sub(USER_A), sub(USER_B)],
    });
    await runPriceAlertsTick(log, NOW, getQuote);
    expect(getQuote).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('réessaie au prochain passage quand le cours est indisponible', async () => {
    fake.seed({ price_alerts: [alert('a1')], push_subscriptions: [sub(USER_A)] });
    await runPriceAlertsTick(log, NOW, vi.fn(async () => Promise.reject(new Error('Yahoo 429'))));
    expect(sendMock).not.toHaveBeenCalled();
    expect(fake.rows('price_alerts')[0].triggered_at).toBeNull();
  });

  it('ignore une alerte dont la devise ne correspond plus au cours', async () => {
    fake.seed({ price_alerts: [alert('a1')], push_subscriptions: [sub(USER_A)] });
    await runPriceAlertsTick(log, NOW, quoteAt(1, 'EUR'));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("déclenche l'alerte même sans appareil abonné (rien à envoyer, pas de boucle)", async () => {
    fake.seed({ price_alerts: [alert('a1')], push_subscriptions: [] });
    await runPriceAlertsTick(log, NOW, quoteAt(325));
    expect(sendMock).not.toHaveBeenCalled();
    expect(fake.rows('price_alerts')[0].triggered_at).toBe(NOW.toISOString());
  });

  it('ouvre la fiche de l’action au clic', async () => {
    fake.seed({ price_alerts: [alert('a1', { symbol: 'MC.PA', currency: 'EUR', threshold: 380 })], push_subscriptions: [sub(USER_A)] });
    await runPriceAlertsTick(log, NOW, quoteAt(379, 'EUR'));
    const body = JSON.parse(sendMock.mock.calls[0][1] as string);
    expect(body.notification.navigate).toMatch(/\/asset\/MC\.PA$/);
    expect(body.notification.tag).toBe('alert-a1');
  });
});
