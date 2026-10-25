/**
 * Signaux calculés par le BFF (GET /api/signals). Miroir de
 * apps/bff/src/signals.ts : toute modification se fait des deux côtés.
 */
import type { Horizon } from '@/constants/horizons';

export type Signal = 'buy' | 'hold' | 'sell' | 'unknown';

/** Un montant dans la devise de cotation et en euros (null si le taux manque). */
export interface Money {
  native: number | null;
  eur: number | null;
}

export interface HistoricalAnalog {
  setupLabel: string;
  occurrences: number;
  /** Ratios (0.05 = +5 %). */
  medianReturn: number | null;
  worstReturn: number | null;
  bestReturn: number | null;
  positiveRatio: number | null;
  baselineMedian: number | null;
  significant: boolean;
  horizonBars: number;
}

export interface Playbook {
  holdingPeriod: string;
  entryWindow: string;
  exitConditions: string[];
  risk: string;
}

export interface SignalDetail {
  symbol: string;
  /** Nom connu de l'univers de l'app ; null sinon. */
  name: string | null;
  horizon: Horizon;
  currency: string;
  barUnit: 'séance' | 'semaine';
  price: Money;
  changePct: number | null;
  quoteTime: number | null;
  chart: { t: number[]; c: number[] } | null;
  score: number | null;
  signal: Signal;
  technical: {
    signal: Signal;
    rsi: number | null;
    trend: 'up' | 'down' | 'flat' | 'unknown';
    rationale: string[];
  };
  analyst: {
    signal: Signal;
    buyRatio: number;
    totalAnalysts: number;
    period: string | null;
    targetMean: Money;
  };
  levels: {
    entry: Money;
    stop: Money;
    target: Money;
    riskReward: number | null;
    unfavorable: boolean;
    stopApplies: boolean;
  };
  analog: HistoricalAnalog | null;
  playbook: Playbook;
  /** Prochaine publication de résultats, située par rapport à la fenêtre de l'horizon. */
  earnings: {
    date: string;
    hour: string;
    daysUntil: number;
    withinWindow: boolean;
  } | null;
  errors: string[];
}

export interface SignalRow {
  symbol: string;
  name: string | null;
  currency: string | null;
  price: Money;
  changePct: number | null;
  score: number | null;
  signal: Signal;
  closes: number[];
  errors: string[];
}

export interface PositionSize {
  shares: number;
  amountEur: number;
  maxLossEur: number;
  cappedByCapital: boolean;
}

/** Fiche renvoyée à l'utilisateur connecté : avec sa taille de position. */
export interface SignalDetailForUser extends SignalDetail {
  capitalSet: boolean;
  riskPerTradePct: number;
  /** null sans capital, sans stop (long terme) ou sans montant en euros. */
  sizing: PositionSize | null;
}

/** Idées du moment (GET /api/ideas), classées par le BFF. */
export interface IdeaPick {
  symbol: string;
  name: string;
  themes: string[];
  /** −1 baissier … +1 haussier, moyenne des thèmes concernés. */
  themeBias: number;
  row: SignalRow;
}

export interface Ideas {
  picks: IdeaPick[];
  /** Candidats non classés faute de score, avec la raison. */
  errors: { symbol: string; error: string }[];
}
