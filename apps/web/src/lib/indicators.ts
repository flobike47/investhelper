/**
 * Indicateurs techniques calculés à partir de séries de prix réelles.
 * Aucune valeur n'est fabriquée — si les données manquent, on renvoie null.
 */

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

/** Wilder's RSI — same formula used by most charting platforms. */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function lastDefined<T>(arr: (T | null)[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null) return arr[i] as T;
  }
  return null;
}

/**
 * Average True Range de Wilder (« New Concepts in Technical Trading Systems »,
 * 1978) — même calcul que StockCharts / TradingView.
 * True range = max(haut − bas, |haut − clôture précédente|, |bas − clôture précédente|),
 * celui de la première bougie = haut − bas. Première valeur = moyenne des
 * `period` premiers TR, puis lissage `(prev × (n − 1) + tr) / n`.
 * Unité : celle des prix (pas un pourcentage).
 */
export function atr(high: number[], low: number[], close: number[], period = 14): (number | null)[] {
  const n = Math.min(high.length, low.length, close.length);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period) return out;

  const tr = (i: number) =>
    i === 0
      ? high[0] - low[0]
      : Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));

  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr(i);
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = (prev * (period - 1) + tr(i)) / period;
    out[i] = prev;
  }
  return out;
}
