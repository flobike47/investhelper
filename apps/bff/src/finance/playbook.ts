import type { Horizon } from './horizons.js';
import { formatEur } from './currency.js';

export interface Playbook {
  /** Durée de détention typique recommandée pour cet horizon. */
  holdingPeriod: string;
  /** Description de la fenêtre d'entrée — conditionnelle, pas une date. */
  entryWindow: string;
  /** Conditions de sortie chiffrées (stop technique, objectif, tendance). */
  exitConditions: string[];
  /** Gestion du risque générique adaptée à l'horizon. */
  risk: string;
}

/**
 * Montants déjà convertis en EUR. `entry`, `stop` et `target` viennent de
 * lib/tradePlan.ts : null quand le signal affiché ne permet pas de plan.
 */
interface PlaybookInput {
  horizon: Horizon;
  entry: number | null;
  stop: number | null;
  target: number | null;
  smaShort: number | null;
  smaLong: number | null;
}

export function buildPlaybook(i: PlaybookInput): Playbook {
  const fmt = (n: number | null) => formatEur(n);

  switch (i.horizon) {
    case 'short':
      return {
        holdingPeriod: '1 à 8 semaines',
        entryWindow:
          i.entry !== null && i.smaShort !== null
            ? `Sur repli vers ${fmt(i.entry)} (zone de la SMA20).`
            : 'Attendre un repli technique avant d\'entrer.',
        exitConditions: [
          i.target !== null
            ? `Objectif technique : ${fmt(i.target)} (2 fois le risque pris)`
            : 'Objectif après une hausse équivalente à 2 fois le risque pris',
          i.stop !== null
            ? `Stop technique possible sous ${fmt(i.stop)} (2 fois la volatilité moyenne sous l'entrée)`
            : 'Stop technique sous le dernier plus bas',
          'Sortie immédiate si dégradation forte du sentiment news',
        ],
        risk: 'Position-sizing serré (1-3% du capital), stop strict. Sensible aux earnings dans la fenêtre.',
      };
    case 'medium':
      return {
        holdingPeriod: '6 à 18 mois',
        entryWindow:
          i.smaShort !== null
            ? `Entrée idéale en 2-3 tranches autour de la SMA50 (${fmt(i.smaShort)}). Acceptable jusqu'à +5% au-dessus.`
            : 'Entrée par tranches sur les replis vers la SMA50.',
        exitConditions: [
          i.target !== null ? `Cible analystes consensuelle : ${fmt(i.target)}` : 'Atteinte de la cible analystes consensuelle',
          i.stop !== null
            ? `Stop technique possible sous ${fmt(i.stop)} (3 fois la volatilité moyenne sous l'entrée)`
            : 'Stop technique sous le dernier plus bas significatif',
          i.smaLong !== null
            ? `Réévaluer la tendance si le cours casse durablement la SMA200 (${fmt(i.smaLong)})`
            : 'Réévaluer la tendance sur cassure durable de la SMA200',
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
