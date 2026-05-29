import type { Candle } from '@/types/finnhub';
import { rsi } from './indicators';

export interface HistoricalAnalog {
  /** Description du setup actuel (ex: "RSI < 35 (survente)") */
  setupLabel: string;
  /** Nombre d'occurrences historiques similaires trouvées */
  occurrences: number;
  /** Médiane des retours sur la fenêtre d'analyse, en % */
  medianReturn: number | null;
  /** Pire et meilleur cas observés */
  worstReturn: number | null;
  bestReturn: number | null;
  /** Probabilité de retour positif (0..1) */
  positiveRatio: number | null;
  /** Horizon en jours (sessions) sur lequel le retour est mesuré */
  horizonDays: number;
}

interface FindOpts {
  rsiBucket: 'oversold' | 'neutral' | 'overbought';
  horizonDays: number;
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
 * le même bucket que le setup actuel, puis mesure le retour des N sessions
 * suivantes pour chacun. Aucune extrapolation : si on n'a que k occurrences,
 * on renvoie k.
 */
export function findRsiAnalog(candle: Candle | null | undefined, opts: FindOpts): HistoricalAnalog | null {
  if (!candle || candle.s !== 'ok' || candle.c.length < 60) return null;

  const closes = candle.c;
  const rsiSeries = rsi(closes, opts.rsiPeriod ?? 14);
  const [low, high] = bucketBounds(opts.rsiBucket);
  const horizon = opts.horizonDays;

  const returns: number[] = [];

  // On évite la sur-représentation : on ne compte qu'une occurrence par
  // "cluster" (jour suivant immédiat skip si déjà dans le bucket).
  let inBucket = false;
  for (let i = 0; i < closes.length - horizon; i++) {
    const r = rsiSeries[i];
    if (r === null) continue;
    if (r >= low && r <= high) {
      if (!inBucket) {
        const future = closes[i + horizon];
        const now = closes[i];
        if (now > 0) {
          returns.push((future - now) / now);
        }
      }
      inBucket = true;
    } else {
      inBucket = false;
    }
  }

  if (returns.length === 0) {
    return {
      setupLabel: setupLabel(opts.rsiBucket),
      occurrences: 0,
      medianReturn: null,
      worstReturn: null,
      bestReturn: null,
      positiveRatio: null,
      horizonDays: horizon,
    };
  }

  const sorted = [...returns].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const positive = returns.filter((r) => r > 0).length;

  return {
    setupLabel: setupLabel(opts.rsiBucket),
    occurrences: returns.length,
    medianReturn: median,
    worstReturn: sorted[0],
    bestReturn: sorted[sorted.length - 1],
    positiveRatio: positive / returns.length,
    horizonDays: horizon,
  };
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
