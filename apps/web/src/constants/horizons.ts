export type Horizon = 'short' | 'medium' | 'long';

export interface HorizonConfig {
  id: Horizon;
  label: string;
  description: string;
  candleResolution: 'D' | 'W' | 'M';
  lookbackDays: number;
  smaShort: number;
  smaLong: number;
  rsiPeriod: number;
}

export const HORIZONS: Record<Horizon, HorizonConfig> = {
  short: {
    id: 'short',
    label: 'Court terme',
    description: 'Quelques semaines à 3 mois — signaux techniques, momentum',
    candleResolution: 'D',
    lookbackDays: 120,
    smaShort: 20,
    smaLong: 50,
    rsiPeriod: 14,
  },
  medium: {
    id: 'medium',
    label: 'Moyen terme',
    description: '6 mois à 2 ans — tendance, consensus analystes',
    candleResolution: 'D',
    lookbackDays: 365,
    smaShort: 50,
    smaLong: 200,
    rsiPeriod: 14,
  },
  long: {
    id: 'long',
    label: 'Long terme',
    description: '3 ans et plus — fondamentaux, prix cible analystes',
    candleResolution: 'W',
    lookbackDays: 365 * 3,
    smaShort: 50,
    smaLong: 200,
    rsiPeriod: 14,
  },
};

export const HORIZON_LIST: HorizonConfig[] = [HORIZONS.short, HORIZONS.medium, HORIZONS.long];
