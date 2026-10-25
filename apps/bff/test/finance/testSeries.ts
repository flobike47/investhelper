import type { Candle } from '../../src/types.js';

/**
 * Séries de prix synthétiques pour les tests de la logique financière.
 * Fichier sans dépendance de test : importable depuis n'importe quel *.test.ts.
 */

/** Série linéaire de `n` points à partir de `start`, pas `step`. */
export function linear(n: number, start: number, step: number): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

/** Enchaîne des segments linéaires : chaque segment repart du dernier point. */
export function segments(start: number, parts: { n: number; step: number }[]): number[] {
  const out: number[] = [];
  let last = start;
  for (const p of parts) {
    for (let i = 0; i < p.n; i++) {
      last += p.step;
      out.push(last);
    }
  }
  return out;
}

/**
 * Bougie à partir des clôtures. Plus haut / plus bas à ±`range` de la clôture
 * (amplitude constante) sauf si fournis.
 */
export function candleOf(closes: number[], range = 1, extra: Partial<Candle> = {}): Candle {
  return {
    c: closes,
    h: closes.map((c) => c + range),
    l: closes.map((c) => c - range),
    o: closes,
    t: closes.map((_, i) => 1_700_000_000 + i * 86_400),
    v: closes.map(() => 1_000),
    s: 'ok',
    ...extra,
  };
}

/** Longue hausse (+1 par séance) puis repli brutal : RSI en survente, tendance encore haussière. */
export const PULLBACK_IN_UPTREND = segments(100, [
  { n: 120, step: 1 },
  { n: 8, step: -4 },
]);

/** Longue baisse (−1 par séance) puis rebond brutal : RSI en surachat, tendance encore baissière. */
export const BOUNCE_IN_DOWNTREND = segments(300, [
  { n: 120, step: -1 },
  { n: 8, step: 4 },
]);
