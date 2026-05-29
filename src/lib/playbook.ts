import type { Horizon } from '@/constants/horizons';
import { formatEur } from './currency';

export interface Playbook {
  /** Durée de détention typique recommandée pour cet horizon. */
  holdingPeriod: string;
  /** Description de la fenêtre d'entrée — conditionnelle, pas une date. */
  entryWindow: string;
  /** Conditions de sortie chiffrées (cible analyste / SMA cassée). */
  exitConditions: string[];
  /** Gestion du risque générique adaptée à l'horizon. */
  risk: string;
}

interface PlaybookInput {
  horizon: Horizon;
  currentPrice: number | null;
  entry: number | null;
  exit: number | null;
  smaShort: number | null;
  smaLong: number | null;
  targetMean: number | null;
}

export function buildPlaybook(i: PlaybookInput): Playbook {
  const fmt = (n: number | null) => formatEur(n);

  switch (i.horizon) {
    case 'short':
      return {
        holdingPeriod: '1 à 8 semaines',
        entryWindow:
          i.entry !== null && i.smaShort !== null
            ? `Sur pullback vers ${fmt(i.entry)} (zone de la MA20). Ne pas chasser au-dessus de ${fmt(i.smaShort * 1.03)}.`
            : 'Attendre un repli technique avant d\'entrer.',
        exitConditions: [
          i.exit !== null ? `Take profit visé : ${fmt(i.exit)} (≈ +15% depuis le prix actuel)` : 'Take profit après une hausse de 10-15%',
          i.smaShort !== null ? `Stop sous la MA20 = ${fmt(i.smaShort * 0.97)} (−3% de marge)` : 'Stop technique sur cassure de la MA20',
          'Sortie immédiate si dégradation forte du sentiment news',
        ],
        risk: 'Position-sizing serré (1-3% du capital), stop strict. Sensible aux earnings dans la fenêtre.',
      };
    case 'medium':
      return {
        holdingPeriod: '6 à 18 mois',
        entryWindow:
          i.smaShort !== null
            ? `Entrée idéale en 2-3 tranches autour de la MA50 (${fmt(i.smaShort)}). Acceptable jusqu'à +5% au-dessus.`
            : 'Entrée par tranches sur les replis vers la MA50.',
        exitConditions: [
          i.targetMean !== null ? `Cible analystes consensuelle : ${fmt(i.targetMean)}` : 'Atteinte de la cible analystes consensuelle',
          i.smaLong !== null ? `Stop sur cassure durable de la MA200 (${fmt(i.smaLong)})` : 'Stop sur cassure de la MA200',
          'Réévaluer si le consensus analystes bascule en "sell" sur 2 trimestres consécutifs',
        ],
        risk: 'Position-sizing modéré (3-8% du capital). Tolérer une volatilité ± 15% sans paniquer.',
      };
    case 'long':
      return {
        holdingPeriod: '3 ans et plus',
        entryWindow:
          'DCA (Dollar Cost Averaging) : entrée par tranches mensuelles régulières, indépendamment du prix exact.',
        exitConditions: [
          'Thèse d\'investissement cassée (changement de modèle économique, perte de moat)',
          'Détérioration durable des fondamentaux (3+ trimestres de revenue en baisse)',
          'Rééquilibrage si la position dépasse 20% du portefeuille',
        ],
        risk: 'Acceptable jusqu\'à 10-15% du capital sur conviction forte. Ignorer la volatilité court terme.',
      };
  }
}
