/**
 * Libellés des horizons, pour l'affichage. Leurs paramètres de calcul
 * (moyennes, RSI, profondeur d'historique, stop) vivent dans le BFF
 * (apps/bff/src/finance/horizons.ts).
 */
export type Horizon = 'short' | 'medium' | 'long';

export interface HorizonLabel {
  id: Horizon;
  label: string;
  description: string;
}

export const HORIZONS: Record<Horizon, HorizonLabel> = {
  short: { id: 'short', label: 'Court terme', description: 'Quelques semaines à 3 mois — signaux techniques, momentum' },
  medium: { id: 'medium', label: 'Moyen terme', description: '6 mois à 2 ans — tendance, consensus analystes' },
  long: { id: 'long', label: 'Long terme', description: '3 ans et plus — fondamentaux, prix cible analystes' },
};

export const HORIZON_LIST: HorizonLabel[] = [HORIZONS.short, HORIZONS.medium, HORIZONS.long];
