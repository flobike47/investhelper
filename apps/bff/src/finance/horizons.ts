export type Horizon = 'short' | 'medium' | 'long';

export interface HorizonConfig {
  id: Horizon;
  label: string;
  description: string;
  candleResolution: 'D' | 'W' | 'M';
  /** Unité d'une bougie, pour libeller les périodes (« 52 semaines », « 21 séances »). */
  barUnit: 'séance' | 'semaine';
  /** Profondeur demandée en jours calendaires (le BFF la convertit en nombre de bougies). */
  lookbackDays: number;
  smaShort: number;
  smaLong: number;
  rsiPeriod: number;
  /**
   * Distance du stop technique sous l'entrée, en multiples d'ATR (2 à 3 ATR est
   * l'usage courant : hors du bruit quotidien sans exposer trop de capital).
   * null en long terme : la sortie se fait sur thèse cassée, pas sur un stop.
   */
  atrStopMultiple: number | null;
}

export const HORIZONS: Record<Horizon, HorizonConfig> = {
  short: {
    id: 'short',
    label: 'Court terme',
    description: 'Quelques semaines à 3 mois — signaux techniques, momentum',
    candleResolution: 'D',
    barUnit: 'séance',
    lookbackDays: 120,
    smaShort: 20,
    smaLong: 50,
    rsiPeriod: 14,
    atrStopMultiple: 2,
  },
  medium: {
    id: 'medium',
    label: 'Moyen terme',
    description: '6 mois à 2 ans — tendance, consensus analystes',
    candleResolution: 'D',
    barUnit: 'séance',
    lookbackDays: 365,
    smaShort: 50,
    smaLong: 200,
    rsiPeriod: 14,
    atrStopMultiple: 3,
  },
  long: {
    id: 'long',
    label: 'Long terme',
    description: '3 ans et plus — fondamentaux, prix cible analystes',
    candleResolution: 'W',
    barUnit: 'semaine',
    // 5 ans ≈ 261 bougies hebdo : assez pour la MM40 et deux fenêtres d'analogue.
    lookbackDays: 365 * 5,
    // En hebdo, MM10 / MM40 ≈ MM50 / MM200 en journalier (5 séances par semaine).
    smaShort: 10,
    smaLong: 40,
    rsiPeriod: 14,
    atrStopMultiple: null,
  },
};

export const HORIZON_LIST: HorizonConfig[] = [HORIZONS.short, HORIZONS.medium, HORIZONS.long];

/**
 * Fenêtre de l'analogue historique, en bougies de la résolution de l'horizon :
 * ~1 mois (21 séances), ~3 mois (63 séances), ~1 an (52 semaines).
 */
export function analogBarsFor(h: Horizon): number {
  return h === 'short' ? 21 : h === 'medium' ? 63 : 52;
}

/**
 * En dessous de ce nombre de cas, un analogue historique est affiché comme
 * « peu significatif » : avec moins de 8 observations, une médiane et un taux
 * de cas positifs varient trop d'un échantillon à l'autre pour être lus comme
 * une tendance.
 */
export const MIN_ANALOG_SAMPLE = 8;

/** Libellé d'une moyenne mobile selon l'unité des bougies : « SMA20 » ou « SMA10 sem. ». */
export function smaLabel(period: number, h: HorizonConfig): string {
  return h.barUnit === 'semaine' ? `SMA${period} sem.` : `SMA${period}`;
}
