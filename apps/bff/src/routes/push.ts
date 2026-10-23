import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { requireUser } from '../auth.js';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
import { pushConfigured, PushUnavailable, sendToUser, validateSubscription } from '../push.js';
import { enforceQuota } from '../ratelimit.js';
import { validateString } from '../validation.js';

interface UnsubscribeBody { endpoint: string }

export async function registerPushRoutes(app: FastifyInstance) {
  /** Clé publique VAPID : le navigateur en a besoin pour s'abonner. */
  app.get('/push/public-key', async (req) => {
    requireUser(req);
    if (!pushConfigured) throw new PushUnavailable();
    return { publicKey: config.vapidPublicKey };
  });

  /**
   * Enregistre l'abonnement de l'appareil courant. Upsert sur l'endpoint :
   * réabonner le même navigateur ne crée pas de doublon, et un autre compte
   * connecté sur cet appareil le récupère.
   */
  app.post('/user/push/subscriptions', async (req) => {
    const user = requireUser(req);
    if (!pushConfigured) throw new PushUnavailable();
    const sub = validateSubscription(req.body);
    const userAgent = (req.headers['user-agent'] ?? '').slice(0, 512) || null;

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: userAgent },
        { onConflict: 'endpoint' },
      );
    if (error) throw error;
    return { ok: true };
  });

  /** Désabonne l'appareil courant (désactivation, déconnexion). */
  app.delete<{ Body: UnsubscribeBody }>('/user/push/subscriptions', async (req) => {
    const user = requireUser(req);
    const endpoint = validateString(req.body?.endpoint ?? '', 'endpoint', 2048, 10);
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);
    if (error) throw error;
    return { ok: true };
  });

  /** Notification de test vers tous les appareils de l'utilisateur. */
  app.post('/user/push/test', async (req) => {
    const user = requireUser(req);
    if (!pushConfigured) throw new PushUnavailable();
    await enforceQuota(user.id, 'pushTest');
    const sent = await sendToUser(
      user.id,
      {
        title: 'Notifications activées',
        body: 'Tu recevras ici le rappel de ton podcast du jour.',
        url: 'podcast',
        tag: 'push-test',
      },
      req.log,
    );
    return { sent };
  });
}
