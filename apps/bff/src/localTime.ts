/**
 * Heure locale d'un utilisateur, indépendante du fuseau du conteneur (UTC
 * sur le Pi). Fonctions pures, `now` injecté : testables, changements
 * d'heure compris.
 */

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Retard max pour rattraper un rappel manqué (BFF redémarré, tick sauté). */
export const MAX_LATE_MINUTES = 180;

export function isValidTime(input: unknown): input is string {
  return typeof input === 'string' && HHMM_RE.test(input);
}

export function isValidTimeZone(input: unknown): input is string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input });
    return true;
  } catch {
    return false;
  }
}

/** Date locale (YYYY-MM-DD) et minutes écoulées depuis minuit dans `timeZone`. */
export function localParts(now: Date, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Vrai quand l'heure locale `hhmm` est déjà passée aujourd'hui dans `timeZone`. */
export function isTimePassed(now: Date, timeZone: string, hhmm: string): boolean {
  return localParts(now, timeZone).minutes >= toMinutes(hhmm);
}

export interface DueInput {
  now: Date;
  timeZone: string;
  pushTime: string;
  /** Dernier jour local d'envoi (YYYY-MM-DD) ou null. */
  lastSentOn: string | null;
}

/**
 * Le rappel du jour est-il à envoyer ? Oui si l'heure choisie est passée,
 * depuis moins de MAX_LATE_MINUTES, et que rien n'a été envoyé ce jour local.
 * Une heure qui n'existe pas (passage à l'heure d'été, 02:30) est rattrapée
 * au tick suivant ; une heure vécue deux fois (heure d'hiver) n'envoie
 * qu'une fois grâce à lastSentOn.
 */
export function isDue({ now, timeZone, pushTime, lastSentOn }: DueInput): boolean {
  const { date, minutes } = localParts(now, timeZone);
  if (lastSentOn !== null && lastSentOn >= date) return false;
  const late = minutes - toMinutes(pushTime);
  return late >= 0 && late < MAX_LATE_MINUTES;
}
