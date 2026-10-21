/** Tracé léger de séries de prix (SVG), sans dépendance de graphique. */

/** Réduit une série à `n` points (pas régulier) pour un tracé léger. */
export function downsample(values: readonly number[], n: number): number[] {
  if (values.length <= n) return [...values];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(values[Math.round((i * (values.length - 1)) / (n - 1))]);
  return out;
}

/** Chemin SVG d'une série dans une boîte w×h (marge d'un px pour le trait). */
export function sparkPath(values: readonly number[], w: number, h: number): string {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return '';
  const min = Math.min(...finite);
  const span = Math.max(...finite) - min || 1;
  return finite
    .map((v, i) => {
      const x = (i * w) / (finite.length - 1);
      const y = h - 1 - ((v - min) / span) * (h - 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
