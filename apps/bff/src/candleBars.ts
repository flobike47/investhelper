export type Resolution = 'D' | 'W' | 'M';

/**
 * Nombre de bougies demandé pour une profondeur `lookbackDays` (jours
 * calendaires). En journalier, une bougie par jour demandé : c'est la
 * convention historique de l'app (Twelve Data `outputsize`), sur laquelle
 * reposent les périodes des horizons. Tous les providers l'appliquent.
 */
export function barsFor(resolution: Resolution, lookbackDays: number): number {
  const bars =
    resolution === 'D' ? lookbackDays : resolution === 'W' ? Math.ceil(lookbackDays / 7) : Math.ceil(lookbackDays / 30);
  return Math.min(5000, bars);
}
