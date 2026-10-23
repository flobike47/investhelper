// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { activeRegistration, describePushTest, pushSupport, subscribeDevice, urlBase64ToUint8Array } from './push';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};
const pushWindow = (standalone: boolean) => ({
  matchMedia: () => ({ matches: standalone }),
  PushManager: class {},
  Notification: class {},
});

describe('pushSupport', () => {
  it("demande d'installer l'app sur iPhone hors écran d'accueil", () => {
    expect(pushSupport({ userAgent: UA.iphoneSafari, serviceWorker: {} }, pushWindow(false))).toBe('needs-install');
  });

  it("est disponible dans l'app iPhone installée", () => {
    expect(pushSupport({ userAgent: UA.iphoneSafari, standalone: true, serviceWorker: {} }, pushWindow(true))).toBe(
      'supported',
    );
  });

  it('est disponible sur un navigateur de bureau', () => {
    expect(pushSupport({ userAgent: UA.macChrome, serviceWorker: {} }, pushWindow(false))).toBe('supported');
  });

  it('est indisponible sans Push API ou sans service worker', () => {
    expect(pushSupport({ userAgent: UA.macChrome }, pushWindow(false))).toBe('unsupported');
    expect(pushSupport({ userAgent: UA.macChrome, serviceWorker: {} }, { matchMedia: () => ({ matches: false }) })).toBe(
      'unsupported',
    );
  });
});

describe('urlBase64ToUint8Array', () => {
  it('décode le base64url sans padding (clé VAPID)', () => {
    // 0xfb 0xff 0xbf → « -_-_ » en base64url
    expect(Array.from(urlBase64ToUint8Array('-_-_'))).toEqual([0xfb, 0xff, 0xbf]);
    expect(Array.from(urlBase64ToUint8Array('AQI'))).toEqual([1, 2]);
  });
});

describe('activeRegistration', () => {
  it("renvoie null sans service worker enregistré (dev), sans attendre `ready`", async () => {
    const sw = { getRegistration: async () => undefined, ready: new Promise<never>(() => {}) };
    await expect(activeRegistration(sw)).resolves.toBeNull();
  });

  it("attend l'activation d'un service worker encore en installation", async () => {
    const ready = { active: {} } as ServiceWorkerRegistration;
    const sw = { getRegistration: async () => ({ active: null }) as ServiceWorkerRegistration, ready: Promise.resolve(ready) };
    await expect(activeRegistration(sw)).resolves.toBe(ready);
  });
});

describe('subscribeDevice', () => {
  it("réutilise l'abonnement existant de l'appareil", async () => {
    const existing = { endpoint: 'https://web.push.apple.com/x' };
    const subscribe = vi.fn();
    const reg = { pushManager: { getSubscription: async () => existing, subscribe } } as unknown as ServiceWorkerRegistration;
    await expect(subscribeDevice(reg, 'AQI')).resolves.toBe(existing);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("réutilise l'abonnement créé avec la même clé VAPID", async () => {
    const existing = { options: { applicationServerKey: new Uint8Array([1, 2]).buffer }, unsubscribe: vi.fn() };
    const subscribe = vi.fn();
    const reg = { pushManager: { getSubscription: async () => existing, subscribe } } as unknown as ServiceWorkerRegistration;
    await expect(subscribeDevice(reg, 'AQI')).resolves.toBe(existing);
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("remplace l'abonnement créé avec une autre clé VAPID (Apple : VapidPkHashMismatch)", async () => {
    const calls: string[] = [];
    const existing = {
      options: { applicationServerKey: new Uint8Array([9, 9]).buffer },
      unsubscribe: vi.fn(async () => calls.push('unsubscribe')),
    };
    const fresh = {};
    const subscribe = vi.fn(async () => (calls.push('subscribe'), fresh));
    const reg = { pushManager: { getSubscription: async () => existing, subscribe } } as unknown as ServiceWorkerRegistration;
    await expect(subscribeDevice(reg, 'AQI')).resolves.toBe(fresh);
    expect(calls).toEqual(['unsubscribe', 'subscribe']);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2]) });
  });

  it('crée un abonnement visible avec la clé VAPID', async () => {
    const subscribe = vi.fn(async () => ({}));
    const reg = { pushManager: { getSubscription: async () => null, subscribe } } as unknown as ServiceWorkerRegistration;
    await subscribeDevice(reg, 'AQI');
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2]) });
  });
});

describe('describePushTest', () => {
  it('confirme un envoi réussi', () => {
    expect(describePushTest({ devices: 2, sent: 1, failures: [{ status: 410, reason: 'Gone' }] })).toEqual({
      ok: true,
      text: 'Notification envoyée.',
    });
  });

  it("distingue l'absence d'appareil, l'erreur réseau, l'expiration et le refus", () => {
    expect(describePushTest({ devices: 0, sent: 0, failures: [] }).text).toMatch(/Aucun appareil enregistré/);
    expect(describePushTest({ devices: 1, sent: 0, failures: [{ status: null, reason: 'ETIMEDOUT' }] }).text).toMatch(
      /n'arrive pas à joindre/,
    );
    expect(describePushTest({ devices: 1, sent: 0, failures: [{ status: 410, reason: 'Gone' }] }).text).toMatch(/a expiré/);
    const refused = describePushTest({ devices: 1, sent: 0, failures: [{ status: 403, reason: 'BadJwtToken' }] });
    expect(refused).toMatchObject({ ok: false });
    expect(refused.text).toContain('(403 BadJwtToken)');
  });
});

/** Exécute public/sw.js avec un faux `self` et renvoie ses écouteurs. */
function loadServiceWorker(windows: Array<{ url: string }> = []) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const scope = 'https://app.test/investhelper/';
  const self = {
    location: new URL('sw.js', scope),
    registration: { scope, showNotification: vi.fn(async () => undefined) },
    clients: {
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => undefined),
      claim: vi.fn(),
    },
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    skipWaiting: vi.fn(),
  };
  const code = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8');
  runInNewContext(code, { self, URL, caches: {}, fetch: vi.fn() });
  return { self, listeners, scope };
}

async function dispatch(handler: (event: unknown) => void, event: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  handler({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
}

describe('service worker : notifications', () => {
  it('affiche la notification du payload', async () => {
    const { self, listeners } = loadServiceWorker();
    const payload = { title: 'Ton podcast du jour est prêt', body: '4 min · Bourse', url: 'podcast', tag: 'podcast-daily' };
    await dispatch(listeners.push, { data: { json: () => payload } });
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      payload.title,
      expect.objectContaining({ body: payload.body, tag: 'podcast-daily', data: { url: 'podcast' } }),
    );
  });

  it('affiche le format déclaratif envoyé par le BFF (Declarative Web Push)', async () => {
    const { self, listeners } = loadServiceWorker();
    const payload = {
      web_push: 8030,
      notification: {
        title: 'Ton podcast du jour est prêt',
        body: '4 min · Bourse',
        navigate: 'https://app.test/investhelper/podcast',
        tag: 'podcast-daily',
        lang: 'fr',
      },
    };
    await dispatch(listeners.push, { data: { json: () => payload } });
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      'Ton podcast du jour est prêt',
      expect.objectContaining({
        body: '4 min · Bourse',
        tag: 'podcast-daily',
        data: { url: 'https://app.test/investhelper/podcast' },
      }),
    );
  });

  it('affiche quand même une notification pour un payload illisible (exigence Safari)', async () => {
    const { self, listeners } = loadServiceWorker();
    await dispatch(listeners.push, { data: { json: () => JSON.parse('pas du json') } });
    expect(self.registration.showNotification).toHaveBeenCalledWith('InvestHelper', expect.anything());
  });

  it('affiche quand même une notification pour un payload JSON null', async () => {
    const { self, listeners } = loadServiceWorker();
    await dispatch(listeners.push, { data: { json: () => null } });
    expect(self.registration.showNotification).toHaveBeenCalledWith('InvestHelper', expect.anything());
  });

  it("ouvre la route du payload dans le scope de l'app", async () => {
    const { self, listeners, scope } = loadServiceWorker();
    await dispatch(listeners.notificationclick, { notification: { close: vi.fn(), data: { url: 'podcast' } } });
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${scope}podcast`);
  });

  it.each(['https://evil.example/phish', '//evil.example/x', '../../autre-app'])(
    "n'ouvre jamais une URL hors du scope (%s)",
    async (url) => {
      const { self, listeners, scope } = loadServiceWorker();
      await dispatch(listeners.notificationclick, { notification: { close: vi.fn(), data: { url } } });
      expect(self.clients.openWindow).toHaveBeenCalledWith(scope);
    },
  );

  it("réutilise la fenêtre de l'app déjà ouverte", async () => {
    const win = { url: 'https://app.test/investhelper/news', focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) };
    const { self, listeners, scope } = loadServiceWorker([win]);
    await dispatch(listeners.notificationclick, { notification: { close: vi.fn(), data: { url: 'podcast' } } });
    expect(win.focus).toHaveBeenCalled();
    expect(win.navigate).toHaveBeenCalledWith(`${scope}podcast`);
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });
});
