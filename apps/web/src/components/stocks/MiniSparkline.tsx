import { theme } from 'antd';
import type { Candle } from '@/types/finnhub';
import { downsample, sparkPath } from '@/lib/sparkline';

/**
 * Mini-courbe décorative d'une ligne de liste (SVG pur, sans recharts).
 * Le sens est porté par le texte voisin (variation signée) : aria-hidden.
 */
export function MiniSparkline({
  candle,
  width = 64,
  height = 28,
}: {
  candle: Candle | null | undefined;
  width?: number;
  height?: number;
}) {
  const { token } = theme.useToken();
  const closes = candle && candle.s === 'ok' ? candle.c : [];
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
