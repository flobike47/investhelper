import type { Candle } from '../types.js';
import { rsi } from './indicators.js';
import { MIN_ANALOG_SAMPLE } from './horizons.js';

export interface HistoricalAnalog {
  /** Description du setup actuel (ex: "RSI < 35 (survente)") */
  setupLabel: string;
  /** Nombre d'occurrences historiques similaires trouvées */
  occurrences: number;
  /** Médiane des retours sur la fenêtre d'analyse, en ratio (0.05 = +5 %) */
  medianReturn: number | null;
  /** Pire et meilleur cas observés */
  worstReturn: number | null;
  bestReturn: number | null;
  /** Probabilité de retour positif (0..1) */
  positiveRatio: number | null;
  /**
   * Médiane des retours sur la même fenêtre depuis n'importe quelle bougie, en
   * ratio : la tendance de fond de l'actif, à laquelle comparer `medianReturn`.
   */
  baselineMedian: number | null;
  /** Assez de cas (≥ MIN_ANALOG_SAMPLE) pour lire la statistique comme une tendance */
  significant: boolean;
  /** Fenêtre sur laquelle le retour est mesuré, en bougies (séances ou semaines selon l'horizon) */
  horizonBars: number;
}

interface FindOpts {
  rsiBucket: 'oversold' | 'neutral' | 'overbought';
  horizonBars: number;
  rsiPeriod?: number;
}

function bucketBounds(b: FindOpts['rsiBucket']): [number, number] {
  switch (b) {
    case 'oversold':
      return [0, 35];
    case 'overbought':
      return [65, 100];
    case 'neutral':
      return [45, 55];
  }
}

/**
 * Trouve dans l'historique réel de la série les jours où le RSI était dans
 * le même bucket que le setup actuel, puis mesure le retour des N bougies
 * suivantes pour chacun. Aucune extrapolation : si on n'a que k occurrences,
 * on renvoie k.
 *
 * Les cas sont indépendants : un seul par épisode (première bougie dans le
 * bucket) et aucune fenêtre ne chevauche la précédente — sinon une même
 * hausse serait comptée plusieurs fois.
 */
export function findRsiAnalog(candle: Candle | null | undefined, opts: FindOpts): HistoricalAnalog | null {
  if (!candle || candle.s !== 'ok' || candle.c.length < 60) return null;

  const closes = candle.c;
  const rsiSeries = rsi(closes, opts.rsiPeriod ?? 14);
  const [low, high] = bucketBounds(opts.rsiBucket);
  const horizon = opts.horizonBars;

  const returns: number[] = [];
  const allReturns: number[] = [];

  let inBucket = false;
  let nextFreeIndex = 0; // première bougie dont la fenêtre ne chevauche pas le cas précédent
  for (let i = 0; i < closes.length - horizon; i++) {
    const r = rsiSeries[i];
    if (r === null) continue;
    const now = closes[i];
    const forward = now > 0 ? (closes[i + horizon] - now) / now : null;
    if (forward !== null) allReturns.push(forward);

    if (r >= low && r <= high) {
      if (!inBucket && i >= nextFreeIndex && forward !== null) {
        returns.push(forward);
        nextFreeIndex = i + horizon;
      }
      inBucket = true;
    } else {
      inBucket = false;
    }
  }

  const baselineMedian = median(allReturns);

  if (returns.length === 0) {
    return {
      setupLabel: setupLabel(opts.rsiBucket),
      occurrences: 0,
      medianReturn: null,
      worstReturn: null,
      bestReturn: null,
      positiveRatio: null,
      baselineMedian,
      significant: false,
      horizonBars: horizon,
    };
  }

  const sorted = [...returns].sort((a, b) => a - b);
  const positive = returns.filter((r) => r > 0).length;

  return {
    setupLabel: setupLabel(opts.rsiBucket),
    occurrences: returns.length,
    medianReturn: median(returns),
    worstReturn: sorted[0],
    bestReturn: sorted[sorted.length - 1],
    positiveRatio: positive / returns.length,
    baselineMedian,
    significant: returns.length >= MIN_ANALOG_SAMPLE,
    horizonBars: horizon,
  };
}

/** Médiane exacte (moyenne des deux valeurs centrales si le nombre est pair) ; null si vide. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function setupLabel(b: FindOpts['rsiBucket']): string {
  switch (b) {
    case 'oversold':
      return 'RSI < 35 (survente)';
    case 'overbought':
      return 'RSI > 65 (surachat)';
    case 'neutral':
      return 'RSI 45-55 (neutre)';
  }
}

/**
 * Choisit le bucket le plus pertinent étant donné le RSI courant.
 * Si on est en zone neutre, on regarde quand même les retours après une
 * survente passée (pour donner du contexte au lecteur).
 */
export function pickBucketFromRsi(currentRsi: number | null): FindOpts['rsiBucket'] {
  if (currentRsi === null) return 'neutral';
  if (currentRsi < 40) return 'oversold';
  if (currentRsi > 60) return 'overbought';
  return 'neutral';
}
