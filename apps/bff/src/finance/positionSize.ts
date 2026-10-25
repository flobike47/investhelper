export interface PositionSize {
  /** Nombre de titres, arrondi au titre inférieur. */
  shares: number;
  /** Montant investi (titres × entrée), en euros. */
  amountEur: number;
  /** Perte si le stop est touché (titres × (entrée − stop)), en euros. */
  maxLossEur: number;
  /** Vrai si le capital, et non le risque, limite la taille. */
  cappedByCapital: boolean;
}

export interface PositionSizeInput {
  capitalEur: number | null;
  /** Part du capital risquée si le stop est touché, en % (1 = 1 %). */
  riskPct: number;
  entryEur: number | null;
  stopEur: number | null;
}

/** Tolérance d'arrondi : 30 / 0,3 vaut 99,999… en flottant et doit donner 100 titres. */
const EPSILON = 1e-9;

/**
 * Taille de position à risque fixe (« fixed fractional ») : on risque
 * `riskPct` % du capital entre l'entrée et le stop, sans jamais investir plus
 * que le capital. null quand un élément manque (pas de valeur par défaut).
 */
export function positionSize(i: PositionSizeInput): PositionSize | null {
  const { capitalEur, riskPct, entryEur, stopEur } = i;
  if (capitalEur === null || !(capitalEur > 0) || !(riskPct > 0)) return null;
  if (entryEur === null || stopEur === null || !(entryEur > 0) || !(stopEur < entryEur)) return null;

  const riskPerShare = entryEur - stopEur;
  const byRisk = Math.floor((capitalEur * riskPct) / 100 / riskPerShare + EPSILON);
  const byCapital = Math.floor(capitalEur / entryEur + EPSILON);
  const shares = Math.max(0, Math.min(byRisk, byCapital));

  return {
    shares,
    amountEur: shares * entryEur,
    maxLossEur: shares * riskPerShare,
    cappedByCapital: byCapital < byRisk,
  };
}
