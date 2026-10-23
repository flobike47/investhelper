import webpush from 'web-push';
import type { FastifyBaseLogger } from 'fastify';
import { config } from './config.js';
import { supabaseAdmin } from './providers/supabaseAdmin.js';
import { BadRequest, HttpError } from './validation.js';

/**
 * Notifications Web Push (VAPID). Le BFF garde la clé privée ; le navigateur
 * s'abonne avec la clé publique et nous confie un endpoint chez son service
 * de push (Apple, Google, Mozilla, Microsoft).
 */

export const pushConfigured = Boolean(
  config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject,
);

if (pushConfigured) {
  webpush.setVapidDetails(config.vapidSubject!, config.vapidPublicKey!, config.vapidPrivateKey!);
}

export class PushUnavailable extends HttpError {
  constructor() { super(503, 'Notifications non configurées sur ce serveur'); }
}

/**
 * Le BFF envoie un POST vers l'endpoint fourni par le client : sans
 * allowlist, c'est une SSRF (requête vers le réseau interne du Pi). On
 * n'accepte que les services de push des navigateurs.
 */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function isAllowedEndpoint(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    PUSH_HOSTS.some((re) => re.test(url.hostname))
  );
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const B64URL_RE = /^[A-Za-z0-9_-]+=*$/;

/** Valide le JSON de `PushSubscription.toJSON()` envoyé par le navigateur. */
export function validateSubscription(input: unknown): PushSubscriptionInput {
  const body = (input ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const { endpoint } = body;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !isAllowedEndpoint(endpoint)) {
    throw new BadRequest('endpoint invalide');
  }
  if (typeof p256dh !== 'string' || p256dh.length > 256 || !B64URL_RE.test(p256dh)) {
    throw new BadRequest('clé p256dh invalide');
  }
  if (typeof auth !== 'string' || auth.length > 64 || !B64URL_RE.test(auth)) {
    throw new BadRequest('clé auth invalide');
  }
  return { endpoint, p256dh, auth };
}

export interface PushPayload {
  title: string;
  body: string;
  /** Route de l'app à ouvrir au clic, relative au scope (ex. 'podcast'). */
  url: string;
  /** Une notification du même tag remplace la précédente sur l'appareil. */
  tag: string;
}

/** Durée de vie chez le service de push : un rappel du matin périmé le soir ne sert à rien. */
const PUSH_TTL_SEC = 4 * 60 * 60;

export interface PushFailure {
  /** Code HTTP du service de push, null pour une erreur réseau (timeout, DNS). */
  status: number | null;
  /** Raison donnée par le service (ex. Apple `VapidPkHashMismatch`) ou message d'erreur. */
  reason: string;
}

export interface PushReport {
  /** Abonnements trouvés pour l'utilisateur. */
  devices: number;
  sent: number;
  failures: PushFailure[];
}

const REASON_MAX = 200;

/**
 * Raison lisible d'un échec. Apple et Mozilla répondent en JSON
 * (`{"reason":…}`, `{"message":…}`), FCM en texte ; web-push ne met dans
 * `message` qu'un générique « Received unexpected response code ».
 */
export function failureReason(err: unknown): string {
  const { body, message } = err as { body?: unknown; message?: unknown };
  let reason = typeof message === 'string' ? message : 'erreur inconnue';
  if (typeof body === 'string' && body.trim()) {
    reason = body.trim();
    try {
      const json = JSON.parse(reason) as { reason?: unknown; message?: unknown };
      const detail = json.reason ?? json.message;
      if (typeof detail === 'string' && detail) reason = detail;
    } catch {
      /* corps texte : gardé tel quel */
    }
  }
  return reason.slice(0, REASON_MAX);
}

/**
 * Envoie `payload` à tous les appareils de `userId`. Un abonnement expiré
 * (404/410 du service de push : app désinstallée, permission retirée) est
 * supprimé. Renvoie le bilan : chaque échec avec la raison du service de push.
 */
export async function sendToUser(
  userId: string,
  payload: PushPayload,
  log: FastifyBaseLogger,
): Promise<PushReport> {
  if (!pushConfigured) throw new PushUnavailable();

  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw error;

  const subs = data ?? [];
  const report: PushReport = { devices: subs.length, sent: 0, failures: [] };
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        // Pas d'en-tête Topic : Apple refuse nos tags (400 BadWebPushTopic) alors
        // que FCM les accepte. Le `tag` de la notification suffit à remplacer
        // la précédente sur l'appareil.
        { TTL: PUSH_TTL_SEC, urgency: 'normal', timeout: 10_000 },
      );
      report.sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      const status = typeof statusCode === 'number' ? statusCode : null;
      const reason = failureReason(err);
      report.failures.push({ status, reason });
      if (status === 404 || status === 410) {
        const { error: delError } = await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', sub.endpoint);
        if (delError) log.warn({ err: delError, userId }, 'push: suppression abonnement expiré échouée');
        else log.info({ userId, status }, 'push: abonnement expiré supprimé');
      } else {
        // Pas l'endpoint dans les logs : c'est un identifiant de l'appareil
        log.warn({ userId, status, reason, host: new URL(sub.endpoint).hostname }, 'push: envoi échoué');
      }
    }
  }
  return report;
}
