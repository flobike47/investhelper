import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { USER_A, USER_B, createSupabaseFake } from './helpers.js';

const { fake, sendMock, textMock, newsMock } = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = 'test-vapid-public';
  process.env.VAPID_PRIVATE_KEY = 'test-vapid-private';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  return {
    fake: {} as ReturnType<typeof createSupabaseFake>,
    sendMock: vi.fn(async (..._args: unknown[]) => ({ statusCode: 201 })),
    textMock: vi.fn(async (..._args: unknown[]) => ''),
    newsMock: vi.fn(async (..._args: unknown[]) => ({ articles: [] as unknown[] })),
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
vi.mock('../src/providers/gemini.js', () => ({ gemini: { text: textMock, json: vi.fn(), ttsMultiSpeaker: vi.fn() } }));
vi.mock('../src/providers/newsapi.js', () => ({ newsapi: { everything: newsMock, topHeadlines: vi.fn() } }));

const { runPodcastReminderTick } = await import('../src/jobs/podcastReminder.js');
const { redis } = await import('../src/cache.js');

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;
const SCRIPT = `Alex: ${'Bonjour, voici les nouvelles du jour. '.repeat(40)}\nSophie: Merci Alex.`;
const APPLE = 'https://web.push.apple.com/device-a';
const FCM = 'https://fcm.googleapis.com/fcm/send/device-b';
// 08:00 à Paris le 23/10/2026
const AT_8 = new Date('2026-10-23T06:00:00Z');

function settings(userId: string, extra: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    podcast_push_enabled: true,
    podcast_push_time: '08:00',
    timezone: 'Europe/Paris',
    podcast_push_last_sent_on: null,
    podcast_duration: 'auto',
    ...extra,
  };
}
const sub = (userId: string, endpoint: string) => ({ user_id: userId, endpoint, p256dh: 'p', auth: 'a' });
const sentPayloads = () => sendMock.mock.calls.map((c) => JSON.parse(c[1] as string));

beforeEach(async () => {
  await redis.flushall();
  sendMock.mockReset();
  sendMock.mockResolvedValue({ statusCode: 201 });
  textMock.mockReset();
  textMock.mockResolvedValue(SCRIPT);
  newsMock.mockReset();
  newsMock.mockResolvedValue({
    articles: [{ title: 'Le CAC 40 progresse', description: null, url: 'https://ex.com/1', source: { name: 'Ex' } }],
  });
  fake.seed(seedOf());
});

describe('rappel quotidien du podcast', () => {
  it("prépare l'épisode du jour puis notifie", async () => {
    await runPodcastReminderTick(log, AT_8);

    expect(fake.rows('podcast_episodes')).toMatchObject([
      { user_id: USER_A, date: '2026-10-23', categories: ['Bourse', 'Énergie'], script: SCRIPT.trim() },
    ]);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentPayloads()[0]).toMatchObject({
      title: 'Ton podcast du jour est prêt',
      body: expect.stringContaining('Bourse, Énergie'),
      url: 'podcast',
      tag: 'podcast-daily',
    });
    expect(fake.rows('user_settings')[0].podcast_push_last_sent_on).toBe('2026-10-23');
  });

  it("n'envoie qu'une fois par jour, même sans le verrou Redis", async () => {
    await runPodcastReminderTick(log, AT_8);
    await redis.flushall(); // le verrou disparaît : seule la réservation en base protège
    await runPodcastReminderTick(log, new Date('2026-10-23T06:01:00Z'));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(fake.rows('podcast_episodes')).toHaveLength(1);
  });

  it("ne fait rien avant l'heure choisie", async () => {
    await runPodcastReminderTick(log, new Date('2026-10-23T05:59:00Z'));
    expect(sendMock).not.toHaveBeenCalled();
    expect(textMock).not.toHaveBeenCalled();
  });

  it("ignore les utilisateurs qui n'ont pas activé l'option", async () => {
    fake.seed({ ...seedOf(), user_settings: [settings(USER_A, { podcast_push_enabled: false })] });
    await runPodcastReminderTick(log, AT_8);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("ne génère rien pour un utilisateur sans appareil abonné", async () => {
    fake.seed({ ...seedOf(), push_subscriptions: [] });
    await runPodcastReminderTick(log, AT_8);
    expect(textMock).not.toHaveBeenCalled();
    expect(fake.rows('podcast_episodes')).toEqual([]);
  });

  it("n'envoie rien sans catégorie choisie", async () => {
    fake.seed({ ...seedOf(), podcast_categories: [] });
    await runPodcastReminderTick(log, AT_8);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("envoie le rappel simple quand la génération échoue", async () => {
    textMock.mockRejectedValueOnce(new Error('Gemini en panne'));
    await runPodcastReminderTick(log, AT_8);
    expect(fake.rows('podcast_episodes')).toEqual([]);
    expect(sentPayloads()).toMatchObject([{ title: "Ton brief du jour t'attend", url: 'podcast' }]);
  });

  it("ne régénère pas un épisode déjà créé aujourd'hui", async () => {
    fake.seed({
      ...seedOf(),
      podcast_episodes: [
        { user_id: USER_A, date: '2026-10-23', categories: ['Bourse'], script: SCRIPT, sources: [], duration_estimate_sec: 240 },
      ],
    });
    await runPodcastReminderTick(log, AT_8);
    expect(textMock).not.toHaveBeenCalled();
    expect(sentPayloads()).toMatchObject([{ title: 'Ton podcast du jour est prêt', body: '4 min · Bourse' }]);
  });

  it("notifie chaque utilisateur sur ses seuls appareils, à son heure", async () => {
    fake.seed({
      ...seedOf(),
      user_settings: [settings(USER_A), settings(USER_B, { podcast_push_time: '09:00' })],
      push_subscriptions: [sub(USER_A, APPLE), sub(USER_B, FCM)],
      podcast_categories: [...seedOf().podcast_categories, { user_id: USER_B, name: 'Tech', position: 0 }],
    });
    await runPodcastReminderTick(log, AT_8);
    expect(sendMock.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint)).toEqual([APPLE]);
  });

  it('supprime un abonnement expiré (410)', async () => {
    sendMock.mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));
    await runPodcastReminderTick(log, AT_8);
    expect(fake.rows('push_subscriptions')).toEqual([]);
  });
});

/** Données de départ du beforeEach, pour les surcharger table par table. */
function seedOf() {
  return {
    user_settings: [settings(USER_A)],
    push_subscriptions: [sub(USER_A, APPLE)],
    podcast_categories: [
      { user_id: USER_A, name: 'Bourse', position: 0 },
      { user_id: USER_A, name: 'Énergie', position: 1 },
    ],
    podcast_episodes: [] as Record<string, unknown>[],
  };
}
