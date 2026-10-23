/**
 * Notifications Web Push côté navigateur : détection du support et
 * abonnement de l'appareil. `navigator`/`window` injectables, comme pwa.ts,
 * donc testables sans navigateur. Aucun appel au BFF ici (voir services/push.ts).
 */
import { isIos, isStandalone } from './pwa';

/**
 * - supported     : on peut demander la permission et s'abonner ;
 * - needs-install : iPhone/iPad hors app installée — iOS (16.4+) ne livre
 *                   les notifications qu'aux apps ajoutées à l'écran d'accueil ;
 * - unsupported   : navigateur sans Push API, ou service worker absent (dev).
 */
export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

interface PushNavigator {
  userAgent: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  serviceWorker?: object;
}

interface PushWindow {
  matchMedia?: (q: string) => { matches: boolean };
  PushManager?: unknown;
  Notification?: unknown;
}

export function pushSupport(nav: PushNavigator, win: PushWindow): PushSupport {
  const { userAgent, maxTouchPoints, standalone } = nav;
  if (isIos({ userAgent, maxTouchPoints }) && !isStandalone({ userAgent, standalone }, win)) return 'needs-install';
  if (!nav.serviceWorker || !win.PushManager || !win.Notification) return 'unsupported';
  return 'supported';
}

/** Clé VAPID publique (base64url) → octets attendus par `pushManager.subscribe`. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Fuseau IANA de l'appareil, pour envoyer le rappel à l'heure locale. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
  } catch {
    return 'Europe/Paris';
  }
}

interface SwContainer {
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  ready: Promise<ServiceWorkerRegistration>;
}

/**
 * Registration active du service worker, ou null s'il n'est pas enregistré
 * (en dev, `registerServiceWorker` ne tourne qu'en build de prod) : on ne
 * reste jamais bloqué sur `serviceWorker.ready`.
 */
export async function activeRegistration(sw: SwContainer): Promise<ServiceWorkerRegistration | null> {
  const reg = await sw.getRegistration();
  if (!reg) return null;
  return reg.active ? reg : sw.ready;
}

/** Abonnement push de cet appareil (réutilisé s'il existe déjà). */
export async function subscribeDevice(
  reg: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true, // exigé par Chrome et Safari : chaque push affiche une notification
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}
