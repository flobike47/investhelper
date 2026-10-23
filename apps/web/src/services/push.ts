import { api } from './api';
import { activeRegistration, subscribeDevice } from '@/lib/push';

/**
 * Abonnement push de cet appareil, côté navigateur et côté BFF. Seul
 * endroit qui combine Push API et appels au BFF (hook de réglages, déconnexion).
 */

export class PushPermissionDenied extends Error {
  constructor() {
    super('Notifications refusées. Réactive-les dans les réglages de ton appareil.');
    this.name = 'PushPermissionDenied';
  }
}

function serviceWorker(): ServiceWorkerContainer | null {
  return typeof navigator !== 'undefined' && navigator.serviceWorker ? navigator.serviceWorker : null;
}

/** Abonnement de cet appareil, ou null (jamais abonné, ou SW absent). */
export async function deviceSubscription(): Promise<PushSubscription | null> {
  const sw = serviceWorker();
  const reg = sw ? await activeRegistration(sw) : null;
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Demande la permission, abonne l'appareil et l'enregistre côté BFF.
 * À appeler directement depuis un geste utilisateur : iOS refuse la demande
 * de permission sinon (d'où la permission AVANT tout appel réseau).
 */
export async function enableDevicePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushPermissionDenied();
  const sw = serviceWorker();
  const reg = sw ? await activeRegistration(sw) : null;
  if (!reg) throw new Error("Les notifications ne sont disponibles que dans l'app installée.");
  const { publicKey } = await api.pushPublicKey();
  const sub = await subscribeDevice(reg, publicKey);
  await api.savePushSubscription(sub.toJSON());
}

/**
 * Désabonne cet appareil (BFF d'abord : il faut encore la session). Le
 * désabonnement local a lieu même si le BFF échoue : sinon l'ancien
 * abonnement serait réutilisé à la réactivation. La ligne orpheline côté
 * BFF est purgée au premier envoi (404/410).
 */
export async function disableDevicePush(): Promise<void> {
  const sub = await deviceSubscription();
  if (!sub) return;
  try {
    await api.deletePushSubscription(sub.endpoint);
  } finally {
    await sub.unsubscribe();
  }
}
