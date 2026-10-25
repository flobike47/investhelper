import { theme } from 'antd';
import { downsample, sparkPath } from '@/lib/sparkline';

/**
 * Mini-courbe décorative d'une ligne de liste (SVG pur, sans recharts).
 * Le sens est porté par le texte voisin (variation signée) : aria-hidden.
 */
export function MiniSparkline({
  closes,
  width = 64,
  height = 28,
}: {
  /** Clôtures de l'horizon (devise native), calculées par le BFF. */
  closes: number[];
  width?: number;
  height?: number;
}) {
  const { token } = theme.useToken();
  const path = sparkPath(downsample(closes, 40), width, height);
  if (!path) return <span aria-hidden style={{ width, height, display: 'inline-block' }} />;
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ flex: '0 0 auto' }}>
      <path
        d={path}
        fill="none"
        stroke={up ? token.colorSuccess : token.colorError}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
