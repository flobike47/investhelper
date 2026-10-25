/**
 * Agrégats affichés en tête du tableau de bord, calculés à partir de l'état
 * de chaque ticker analysé. Logique pure : aucune dépendance React ni réseau.
 *
 * Principe : une donnée absente n'est jamais remplacée par 0. Tant qu'aucune
 * valeur n'est disponible, les agrégats valent `null` et l'UI affiche un état
 * de chargement ou « — », jamais un chiffre plausible mais faux.
 */

import type { Money, Signal } from '@/types/signals';

/** Sous-ensemble d'un `TickerView` utile aux agrégats (évite d'importer le hook). */
export interface TickerSnapshot {
  loading: boolean;
  error: Error | null;
  changePct: number | null;
  /** Score calculé par le BFF ; null sans historique de cours. */
  score: number | null;
  signal: Signal;
}

export type TickerStatus = 'loading' | 'error' | 'partial' | 'ok';

/**
 * État d'affichage d'un ticker :
 *  - `loading` : au moins une requête en cours ;
 *  - `error`   : une requête a échoué et on n'a ni prix ni score à montrer ;
 *  - `partial` : une requête a échoué mais une partie des données est affichable ;
 *  - `ok`      : tout est arrivé sans erreur.
 */
export function tickerStatus(t: TickerSnapshot & { price: Money | null }): TickerStatus {
  if (t.loading) return 'loading';
  if (!t.error) return 'ok';
  const native = t.price?.native ?? null;
  const hasSomething = t.score !== null || (native !== null && Number.isFinite(native));
  return hasSomething ? 'partial' : 'error';
}

/**
 * Moyenne arithmétique des valeurs finies ; `null`, `undefined`, `NaN` et
 * `±Infinity` sont ignorés. Renvoie `null` s'il ne reste aucune valeur.
 */
export function averageOfAvailable(values: readonly (number | null | undefined)[]): number | null {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n === 0 ? null : sum / n;
}

export type Trend = 'up' | 'down' | 'flat';

/**
 * Sens d'une variation, évalué à la précision affichée (`digits` décimales)
 * pour qu'une flèche ne contredise jamais un « 0,00 % » affiché.
 * `null` si la variation est inconnue.
 */
export function trendOf(pct: number | null | undefined, digits = 2): Trend | null {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return null;
  const rounded = Number(pct.toFixed(digits));
  if (rounded > 0) return 'up';
  if (rounded < 0) return 'down';
  return 'flat';
}

export interface WatchlistSummary {
  /** Variation moyenne du jour en % (0-100), sur les seuls tickers qui l'ont. */
  avgChangePct: number | null;
  /** Nombre de tickers ayant contribué à la moyenne. */
  changeSampleSize: number;
  /** Nombre de tickers disposant d'un score (dénominateur honnête du compteur). */
  scoredCount: number;
  /** Nombre de tickers dont le signal est `buy`. */
  buyCount: number;
  /** Nombre de tickers encore en chargement. */
  pendingCount: number;
  /** Nombre de tickers ayant au moins une requête en erreur. */
  errorCount: number;
}

export function summarizeWatchlist(tickers: readonly TickerSnapshot[]): WatchlistSummary {
  const changes = tickers
    .map((t) => t.changePct)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const scored = tickers.filter((t) => t.score !== null);
  return {
    avgChangePct: averageOfAvailable(changes),
    changeSampleSize: changes.length,
    scoredCount: scored.length,
    buyCount: scored.filter((t) => t.signal === 'buy').length,
    pendingCount: tickers.filter((t) => t.loading).length,
    errorCount: tickers.filter((t) => t.error !== null).length,
  };
}

/**
 * Message lisible pour une erreur d'appel au BFF. Les erreurs sont des
 * `ApiError` (cf. services/api.ts) : on ajoute la référence `reqId` quand elle
 * existe, utile au support. Typage structurel pour ne pas importer le client HTTP.
 */
export function describeError(err: Error | null | undefined): string | null {
  if (!err) return null;
  const message = err.message?.trim() || 'Erreur inconnue';
  const reqId = (err as { reqId?: unknown }).reqId;
  return typeof reqId === 'string' && reqId ? `${message} (réf. ${reqId})` : message;
}
