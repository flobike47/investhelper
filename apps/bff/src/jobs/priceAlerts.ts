import type { FastifyBaseLogger } from 'fastify';
import { redis } from '../cache.js';
import { cachedQuote } from '../marketCache.js';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
import { pushConfigured, sendToUser, type PushPayload } from '../push.js';
import type { MarketQuote } from '../types.js';

/**
 * Alertes de prix (seuil libre, stop, objectif).
 *
 * Toutes les 5 minutes : les alertes actives sont regroupées par symbole
 * (un seul cours demandé par symbole, via le cache de 60 s) ; chaque alerte
 * franchie est réservée par un UPDATE conditionnel sur triggered_at (un seul
 * envoi, même avec deux passages ou deux instances), puis notifiée.
 */

const TICK_MS = 5 * 60_000;
const LOCK_KEY = 'lock:price-alerts';
const LOCK_TTL_SEC = 4 * 60;

interface ActiveAlert {
  id: string;
  user_id: string;
  symbol: string;
  direction: 'above' | 'below';
  threshold: number | string;
  currency: string;
  kind: 'price' | 'stop' | 'target';
}

const KIND_LABELS: Record<ActiveAlert['kind'], string> = {
  price: 'Alerte de prix',
  stop: 'Stop technique',
  target: 'Objectif',
};

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function alertPayload(alert: ActiveAlert, price: number): PushPayload {
  const threshold = Number(alert.threshold);
  const verb = alert.direction === 'above' ? 'a dépassé' : 'est passé sous';
  return {
    title: `${alert.symbol} ${verb} ${formatPrice(threshold, alert.currency)}`,
    body: `${KIND_LABELS[alert.kind]} · cours ${formatPrice(price, alert.currency)}`,
    url: `asset/${encodeURIComponent(alert.symbol)}`,
    tag: `alert-${alert.id}`,
  };
}

function crossed(alert: ActiveAlert, price: number): boolean {
  const threshold = Number(alert.threshold);
  return alert.direction === 'above' ? price >= threshold : price <= threshold;
}

/** Réserve l'alerte. Faux si un autre passage l'a déjà déclenchée. */
async function claim(alert: ActiveAlert, price: number, now: Date): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('price_alerts')
    .update({ triggered_at: now.toISOString(), triggered_price: price })
    .eq('id', alert.id)
    .eq('user_id', alert.user_id)
    .or('triggered_at.is.null')
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Un passage du job. Exporté pour les tests (`now` et la source du cours injectés). */
export async function runPriceAlertsTick(
  log: FastifyBaseLogger,
  now = new Date(),
  getQuote: (symbol: string) => Promise<MarketQuote> = (s) => cachedQuote(s, log),
): Promise<void> {
  if (!pushConfigured) return;

  try {
    const locked = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL_SEC, 'NX');
    if (locked === null) return;
  } catch {
    /* Redis down : la réservation en base empêche quand même les doublons */
  }

  const { data, error } = await supabaseAdmin
    .from('price_alerts')
    .select('id, user_id, symbol, direction, threshold, currency, kind')
    .or('triggered_at.is.null');
  if (error) throw error;

  const bySymbol = new Map<string, ActiveAlert[]>();
  for (const a of (data ?? []) as ActiveAlert[]) {
    bySymbol.set(a.symbol, [...(bySymbol.get(a.symbol) ?? []), a]);
  }

  for (const [symbol, alerts] of bySymbol) {
    let quote: MarketQuote;
    try {
      quote = await getQuote(symbol);
    } catch (err) {
      log.warn({ err, symbol }, 'alertes : cours indisponible, nouvel essai au prochain passage');
      continue;
    }
    for (const alert of alerts) {
      try {
        // Seuil fixé dans la devise du cours à la création : une autre devise
        // (changement de source) rendrait la comparaison fausse.
        if (quote.currency !== alert.currency) {
          log.warn({ alertId: alert.id, symbol, expected: alert.currency, got: quote.currency }, 'alertes : devise différente, alerte ignorée');
          continue;
        }
        if (!crossed(alert, quote.c)) continue;
        if (!(await claim(alert, quote.c, now))) continue;
        const { sent, failures } = await sendToUser(alert.user_id, alertPayload(alert, quote.c), log);
        log.info({ alertId: alert.id, userId: alert.user_id, symbol, sent, failed: failures.length }, 'alerte de prix envoyée');
      } catch (err) {
        log.error({ err, alertId: alert.id }, 'alertes : échec pour cette alerte');
      }
    }
  }
}

/** Démarre le job ; renvoie la fonction d'arrêt (appelée au SIGTERM). */
export function startPriceAlerts(log: FastifyBaseLogger): () => void {
  if (!pushConfigured) {
    log.warn('VAPID_* absentes : alertes de prix désactivées');
    return () => {};
  }
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runPriceAlertsTick(log)
      .catch((err) => log.error({ err }, 'alertes : passage échoué'))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  return () => clearInterval(timer);
}
