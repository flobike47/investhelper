import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { disableDevicePush, enableDevicePush, PushPermissionDenied } from './push';

vi.mock('./api', () => ({
  api: {
    pushPublicKey: vi.fn(async () => ({ publicKey: 'AQI' })),
    savePushSubscription: vi.fn(async () => ({ ok: true })),
    deletePushSubscription: vi.fn(async () => ({ ok: true })),
  },
}));

const calls: string[] = [];
const subscription = {
  endpoint: 'https://web.push.apple.com/device',
  toJSON: () => ({ endpoint: 'https://web.push.apple.com/device', keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(async () => true),
};

function installBrowser(permission: NotificationPermission, existing: typeof subscription | null = null) {
  const reg = {
    active: {},
    pushManager: {
      getSubscription: vi.fn(async () => existing),
      subscribe: vi.fn(async () => subscription),
    },
  };
  vi.stubGlobal('Notification', {
    requestPermission: vi.fn(async () => {
      calls.push('permission');
      return permission;
    }),
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => reg, ready: Promise.resolve(reg) },
  });
  return reg;
}

beforeEach(() => {
  calls.length = 0;
  vi.mocked(api.pushPublicKey).mockImplementation(async () => {
    calls.push('public-key');
    return { publicKey: 'AQI' };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('enableDevicePush', () => {
  it("demande la permission avant tout appel réseau (geste exigé par iOS), puis enregistre l'appareil", async () => {
    installBrowser('granted');
    await enableDevicePush();
    expect(calls).toEqual(['permission', 'public-key']);
    expect(api.savePushSubscription).toHaveBeenCalledWith(subscription.toJSON());
  });

  it("s'arrête sans appel réseau si la permission est refusée", async () => {
    installBrowser('denied');
    await expect(enableDevicePush()).rejects.toBeInstanceOf(PushPermissionDenied);
    expect(calls).toEqual(['permission']);
  });
});

describe('disableDevicePush', () => {
  it("retire l'appareil côté BFF puis se désabonne", async () => {
    installBrowser('granted', subscription);
    await disableDevicePush();
    expect(api.deletePushSubscription).toHaveBeenCalledWith(subscription.endpoint);
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it("se désabonne même si le BFF échoue (sinon l'abonnement serait réutilisé)", async () => {
    installBrowser('granted', subscription);
    subscription.unsubscribe.mockClear();
    vi.mocked(api.deletePushSubscription).mockRejectedValueOnce(new Error('réseau'));
    await expect(disableDevicePush()).rejects.toThrow('réseau');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});
