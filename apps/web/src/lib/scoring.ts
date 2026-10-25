import type { Candle, RecommendationTrend, PriceTarget } from '@/types/finnhub';
import { lastDefined, rsi, sma } from './indicators';
import { smaLabel, type HorizonConfig } from '@/constants/horizons';

export type Signal = 'buy' | 'hold' | 'sell' | 'unknown';

export interface TechnicalAnalysis {
  signal: Signal;
  rsi: number | null;
  smaShort: number | null;
  smaLong: number | null;
  trend: 'up' | 'down' | 'flat' | 'unknown';
  rationale: string[];
}

export interface AnalystSummary {
  signal: Signal;
  buyRatio: number;          // 0-1
  totalAnalysts: number;
  period: string | null;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
}

export interface CombinedScore {
  score: number;             // -100..+100
  signal: Signal;
  technical: TechnicalAnalysis;
  analyst: AnalystSummary;
}

export function analyzeTechnicals(candle: Candle | null, horizon: HorizonConfig): TechnicalAnalysis {
  if (!candle || candle.s !== 'ok' || !candle.c?.length) {
    return {
      signal: 'unknown',
      rsi: null,
      smaShort: null,
      smaLong: null,
      trend: 'unknown',
      rationale: ['Pas de données historiques disponibles.'],
    };
  }

  const closes = candle.c;
  const lastClose = closes[closes.length - 1];
  const smaS = lastDefined(sma(closes, horizon.smaShort));
  const smaL = lastDefined(sma(closes, horizon.smaLong));
  const r = lastDefined(rsi(closes, horizon.rsiPeriod));

  const trend: TechnicalAnalysis['trend'] =
    smaS !== null && smaL !== null
      ? smaS > smaL * 1.005
        ? 'up'
        : smaS < smaL * 0.995
        ? 'down'
        : 'flat'
      : 'unknown';

  const rationale: string[] = [];
  let buyVotes = 0;
  let sellVotes = 0;

  if (r !== null) {
    if (r < 30) {
      buyVotes++;
      rationale.push(`RSI ${r.toFixed(0)} : zone de survente.`);
    } else if (r > 70) {
      sellVotes++;
      rationale.push(`RSI ${r.toFixed(0)} : zone de surachat.`);
    } else {
      rationale.push(`RSI ${r.toFixed(0)} : neutre.`);
    }
  }

  const sS = smaLabel(horizon.smaShort, horizon);
  const sL = smaLabel(horizon.smaLong, horizon);
  if (trend === 'up') {
    buyVotes++;
    rationale.push(`${sS} > ${sL} : tendance haussière.`);
  } else if (trend === 'down') {
    sellVotes++;
    rationale.push(`${sS} < ${sL} : tendance baissière.`);
  } else if (smaL === null) {
    rationale.push(`Historique insuffisant pour la ${sL} (${closes.length} bougies) : tendance non évaluée.`);
  }

  if (smaS !== null) {
    if (lastClose > smaS) {
      buyVotes += 0.5;
    } else {
      sellVotes += 0.5;
    }
  }

  const signal: Signal =
    buyVotes - sellVotes >= 1.5 ? 'buy' : sellVotes - buyVotes >= 1.5 ? 'sell' : 'hold';

  // Les niveaux du plan (entrée, stop, objectif) sont calculés par
  // lib/tradePlan.ts à partir du signal combiné affiché, pas d'ici.
  return {
    signal,
    rsi: r,
    smaShort: smaS,
    smaLong: smaL,
    trend,
    rationale,
  };
}

export function summarizeAnalysts(
  trends: RecommendationTrend[] | null,
  target: PriceTarget | null,
): AnalystSummary {
  const latest = trends?.[0];
  if (!latest) {
    return {
      signal: 'unknown',
      buyRatio: 0,
      totalAnalysts: 0,
      period: null,
      targetMean: target?.targetMean ?? null,
      targetHigh: target?.targetHigh ?? null,
      targetLow: target?.targetLow ?? null,
    };
  }
  const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
  const buyish = latest.strongBuy + latest.buy;
  const sellish = latest.sell + latest.strongSell;
  const buyRatio = total === 0 ? 0 : buyish / total;

  const signal: Signal =
    total === 0
      ? 'unknown'
      : buyish > sellish && buyRatio >= 0.5
      ? 'buy'
      : sellish > buyish
      ? 'sell'
      : 'hold';

  return {
    signal,
    buyRatio,
    totalAnalysts: total,
    period: latest.period,
    targetMean: target?.targetMean ?? null,
    targetHigh: target?.targetHigh ?? null,
    targetLow: target?.targetLow ?? null,
  };
}

const SIGNAL_SCORE: Record<Signal, number> = { buy: 1, hold: 0, sell: -1, unknown: 0 };

export function combine(
  technical: TechnicalAnalysis,
  analyst: AnalystSummary,
  currentPrice: number | null,
): CombinedScore {
  const techScore = SIGNAL_SCORE[technical.signal];
  const analystScore = SIGNAL_SCORE[analyst.signal];

  // Bonus / malus based on upside vs analyst mean target
  let upsideBonus = 0;
  if (currentPrice && analyst.targetMean && currentPrice > 0) {
    const upside = (analyst.targetMean - currentPrice) / currentPrice;
    upsideBonus = Math.max(-0.5, Math.min(0.5, upside)); // capped
  }

  const raw = techScore * 0.4 + analystScore * 0.5 + upsideBonus * 0.1;
  const score = Math.round(raw * 100);

  const signal: Signal =
    technical.signal === 'unknown' && analyst.signal === 'unknown'
      ? 'unknown'
      : score >= 30
      ? 'buy'
      : score <= -30
      ? 'sell'
      : 'hold';

  return { score, signal, technical, analyst };
}
