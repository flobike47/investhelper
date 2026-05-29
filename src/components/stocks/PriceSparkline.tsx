import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { Candle } from '@/types/finnhub';
import dayjs from 'dayjs';

export function PriceSparkline({
  candle,
  height = 60,
  color = '#22c55e',
}: {
  candle: Candle | null | undefined;
  height?: number;
  color?: string;
}) {
  if (!candle || candle.s !== 'ok' || !candle.c?.length) {
    return (
      <div
        style={{
          height,
          display: 'grid',
          placeItems: 'center',
          color: '#666',
          fontSize: 12,
        }}
      >
        pas de données
      </div>
    );
  }

  // Date format adapté à la durée affichée
  const spanDays =
    candle.t.length > 1
      ? (candle.t[candle.t.length - 1] - candle.t[0]) / 86400
      : 0;
  const dateFormat =
    spanDays > 365 * 2 ? 'MMM YY' : spanDays > 180 ? 'DD MMM' : 'DD MMM';
  const tooltipFormat = spanDays > 365 ? 'DD MMM YYYY' : 'DD MMM';

  const data = candle.t.map((t, i) => ({
    date: dayjs.unix(t).format(dateFormat),
    fullDate: dayjs.unix(t).format(tooltipFormat),
    price: candle.c[i],
  }));
  const first = candle.c[0];
  const last = candle.c[candle.c.length - 1];
  const trendColor = last >= first ? color : '#ef4444';

  // Réduit le nombre de ticks affichés pour rester lisible
  const tickCount = Math.min(6, data.length);
  const tickInterval = Math.max(0, Math.floor(data.length / tickCount) - 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f242e" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: '#1f242e' }}
          interval={tickInterval}
          minTickGap={20}
        />
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Tooltip
          contentStyle={{
            background: '#181c25',
            border: '1px solid #1f242e',
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(v: number) => v.toFixed(2)}
          labelFormatter={(_, payload) =>
            (payload as { payload?: { fullDate?: string } }[])?.[0]?.payload?.fullDate ?? ''
          }
          labelStyle={{ color: '#9ca3af' }}
        />
        <Line
          type="monotone"
          dataKey="price"
          stroke={trendColor}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
