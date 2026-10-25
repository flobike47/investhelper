import type { HorizonConfig } from './horizons.js';

export interface EarningsWindow {
  /** Date de publication, YYYY-MM-DD. */
  date: string;
  /** 'bmo' avant ouverture, 'amc' après clôture, '' si non précisé. */
  hour: string;
  /** Jours calendaires jusqu'à la publication (négatif si passée). */
  daysUntil: number;
  /** Publication dans la fenêtre d'avertissement de l'horizon. */
  withinWindow: boolean;
}

const DAY_MS = 86_400_000;

/**
 * Situe la prochaine publication de résultats par rapport à la fenêtre de
 * l'horizon. Jours comptés en dates UTC (la date de publication n'a pas
 * d'heure fiable). null si aucune date exploitable.
 */
export function earningsInWindow(
  event: { date: string; hour?: string } | null,
  horizon: HorizonConfig,
  now: Date,
): EarningsWindow | null {
  if (!event || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return null;
  const eventDay = Date.parse(`${event.date}T00:00:00Z`);
  if (!Number.isFinite(eventDay)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysUntil = Math.round((eventDay - today) / DAY_MS);
  const limit = horizon.earningsWarningDays;
  return {
    date: event.date,
    hour: event.hour ?? '',
    daysUntil,
    withinWindow: limit !== null && daysUntil >= 0 && daysUntil <= limit,
  };
}
