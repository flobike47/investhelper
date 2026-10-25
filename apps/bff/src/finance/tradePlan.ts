import type { Candle } from '../types.js';
import type { HorizonConfig } from './horizons.js';
import { ATR_PERIOD, MIN_RISK_REWARD, TARGET_RISK_MULTIPLE } from './risk.js';
import { atr, lastDefined } from './indicators.js';
import type { Signal } from './scoring.js';

/** Niveaux chiffrés du plan conditionnel, dans la devise native de l'actif. */
export interface TradeLevels {
  /** Zone d'entrée : repli vers la moyenne courte, jamais au-dessus du cours. */
  entry: number | null;
  /** Stop technique : entrée − k × ATR (k selon l'horizon). */
  stop: number | null;
  /** Objectif : 2 × le risque en court terme, cible analystes au-delà. */
  target: number | null;
  /** (objectif − entrée) / (entrée − stop). */
  riskReward: number | null;
  /** Gain/risque sous MIN_RISK_REWARD. */
  unfavorable: boolean;
}

export interface TradeLevelsInput {
  candle: Candle | null | undefined;
  /** Signal affiché à l'utilisateur (le signal combiné), pas le seul vote technique. */
  signal: Signal;
  horizon: HorizonConfig;
  smaShort: number | null;
  targetMean: number | null;
}

const NO_LEVELS: TradeLevels = { entry: null, stop: null, target: null, riskReward: null, unfavorable: false };

/**
 * Plan de risque cohérent avec le signal affiché. Invariant garanti : quand ils
 * existent, stop < entrée ≤ cours < objectif. Un niveau qui ne le respecterait
 * pas vaut null plutôt que d'afficher un plan impossible.
 */
export function buildTradeLevels(i: TradeLevelsInput): TradeLevels {
  // Pas de zone d'entrée sur un signal baissier ou inconnu.
  if (i.signal !== 'buy' && i.signal !== 'hold') return NO_LEVELS;
  const c = i.candle;
  if (!c || c.s !== 'ok' || c.c.length === 0) return NO_LEVELS;

  const lastClose = c.c[c.c.length - 1];
  if (!Number.isFinite(lastClose) || lastClose <= 0) return NO_LEVELS;

  const entry = i.smaShort !== null && i.smaShort > 0 ? Math.min(lastClose, i.smaShort) : lastClose;

  const atrValue = lastDefined(atr(c.h, c.l, c.c, ATR_PERIOD));
  const k = i.horizon.atrStopMultiple;
  const rawStop = k !== null && atrValue !== null && atrValue > 0 ? entry - k * atrValue : null;
  const stop = rawStop !== null && rawStop > 0 ? rawStop : null;

  const rawTarget =
    i.horizon.id === 'short'
      ? stop !== null
        ? entry + TARGET_RISK_MULTIPLE * (entry - stop)
        : null
      : i.targetMean;
  // Un objectif déjà atteint par le cours n'est plus un objectif.
  const target = rawTarget !== null && rawTarget > lastClose ? rawTarget : null;

  const riskReward = stop !== null && target !== null ? (target - entry) / (entry - stop) : null;

  return {
    entry,
    stop,
    target,
    riskReward,
    unfavorable: riskReward !== null && riskReward < MIN_RISK_REWARD,
  };
}
