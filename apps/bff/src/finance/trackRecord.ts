import { MIN_ANALOG_SAMPLE } from './horizons.js';
import type { Signal } from './scoring.js';

/** Un instantané quotidien (table signal_snapshots). */
export interface SnapshotPoint {
  symbol: string;
  /** YYYY-MM-DD */
  day: string;
  signal: Signal;
  /** Cours de clôture du jour, devise de cotation. */
  price: number;
}

/** Fenêtres de mesure, en jours calendaires. */
export const WINDOWS = { '1m': 30, '3m': 91, '12m': 365 } as const;
export type WindowId = keyof typeof WINDOWS;
type TrackedSignal = Exclude<Signal, 'unknown'>;

/**
 * Tolérance sur la date d'arrivée : le premier instantané au moins Δ jours
 * plus tard doit tomber dans la semaine qui suit (week-end, férié, job
 * manqué), sinon le symbole n'était plus suivi et le cas est ignoré.
 */
const ARRIVAL_TOLERANCE_DAYS = 7;
/** Le repère doit avoir un instantané au plus 3 jours avant le signal. */
const BENCH_START_TOLERANCE_DAYS = 3;

export interface WindowStats {
  /** Nombre de signaux mesurés (un par changement de signal). */
  n: number;
  /** Médiane des rendements, ratio (0.05 = +5 %). */
  medianReturn: number | null;
  /** Médiane de l'écart avec le repère sur les mêmes dates, ratio. */
  medianExcess: number | null;
  /** Au moins MIN_ANALOG_SAMPLE cas : lisible comme une tendance. */
  significant: boolean;
}

export interface TrackRecord {
  benchmark: string;
  /** Premier jour suivi ; null sans donnée. */
  since: string | null;
  bySignal: Record<TrackedSignal, Record<WindowId, WindowStats>>;
}

const DAY_MS = 86_400_000;
const dayNum = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Premier point au jour `from` ou après, s'il arrive avant `from + tolérance`. */
function firstFrom(series: SnapshotPoint[], from: number, tolerance: number): SnapshotPoint | null {
  const p = series.find((x) => dayNum(x.day) >= from);
  return p && dayNum(p.day) <= from + tolerance ? p : null;
}

/** Dernier point au jour `at` ou avant, s'il date d'au plus `tolerance` jours. */
function lastUntil(series: SnapshotPoint[], at: number, tolerance: number): SnapshotPoint | null {
  let found: SnapshotPoint | null = null;
  for (const x of series) {
    if (dayNum(x.day) > at) break;
    found = x;
  }
  return found && dayNum(found.day) >= at - tolerance ? found : null;
}

/**
 * Performance réelle des signaux émis. Un même signal répété jour après jour
 * ne compte qu'une fois (au jour où il apparaît) : sinon des jours très
 * corrélés gonfleraient l'échantillon. Rendements en devise de cotation.
 */
export function computeTrackRecord(points: SnapshotPoint[], benchmark = 'SPY'): TrackRecord {
  const bySymbol = new Map<string, SnapshotPoint[]>();
  for (const p of points) bySymbol.set(p.symbol, [...(bySymbol.get(p.symbol) ?? []), p]);
  for (const series of bySymbol.values()) series.sort((a, b) => a.day.localeCompare(b.day));
  const bench = bySymbol.get(benchmark) ?? [];

  const samples: Record<TrackedSignal, Record<WindowId, { ret: number[]; excess: number[] }>> = {
    buy: { '1m': { ret: [], excess: [] }, '3m': { ret: [], excess: [] }, '12m': { ret: [], excess: [] } },
    hold: { '1m': { ret: [], excess: [] }, '3m': { ret: [], excess: [] }, '12m': { ret: [], excess: [] } },
    sell: { '1m': { ret: [], excess: [] }, '3m': { ret: [], excess: [] }, '12m': { ret: [], excess: [] } },
  };

  for (const [symbol, series] of bySymbol) {
    if (symbol === benchmark) continue;
    series.forEach((p, i) => {
      if (p.signal === 'unknown' || (i > 0 && series[i - 1].signal === p.signal)) return;
      const start = dayNum(p.day);
      for (const [id, days] of Object.entries(WINDOWS) as [WindowId, number][]) {
        const fwd = firstFrom(series, start + days, ARRIVAL_TOLERANCE_DAYS);
        if (!fwd || !(p.price > 0)) continue;
        const ret = fwd.price / p.price - 1;
        samples[p.signal][id].ret.push(ret);
        const b0 = lastUntil(bench, start, BENCH_START_TOLERANCE_DAYS);
        const b1 = firstFrom(bench, start + days, ARRIVAL_TOLERANCE_DAYS);
        if (b0 && b1 && b0.price > 0) samples[p.signal][id].excess.push(ret - (b1.price / b0.price - 1));
      }
    });
  }

  const stats = (s: { ret: number[]; excess: number[] }): WindowStats => ({
    n: s.ret.length,
    medianReturn: median(s.ret),
    medianExcess: median(s.excess),
    significant: s.ret.length >= MIN_ANALOG_SAMPLE,
  });
  const days = points.map((p) => p.day).sort();
  return {
    benchmark,
    since: days[0] ?? null,
    bySignal: {
      buy: { '1m': stats(samples.buy['1m']), '3m': stats(samples.buy['3m']), '12m': stats(samples.buy['12m']) },
      hold: { '1m': stats(samples.hold['1m']), '3m': stats(samples.hold['3m']), '12m': stats(samples.hold['12m']) },
      sell: { '1m': stats(samples.sell['1m']), '3m': stats(samples.sell['3m']), '12m': stats(samples.sell['12m']) },
    },
  };
}
