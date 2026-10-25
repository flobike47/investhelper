/**
 * Paramètres du plan de risque (lib/tradePlan.ts). Conventions répandues de
 * gestion du risque, pas des valeurs optimisées : à recalibrer quand le suivi
 * des signaux émis donnera des mesures réelles.
 */

/** Période de l'ATR (Wilder) servant à placer le stop. */
export const ATR_PERIOD = 14;

/** Objectif court terme = entrée + ce multiple du risque pris (entrée − stop). */
export const TARGET_RISK_MULTIPLE = 2;

/** Sous ce rapport gain/risque, le plan est signalé « défavorable ». */
export const MIN_RISK_REWARD = 1.5;
