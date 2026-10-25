import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { theme } from 'antd';
import { formatSignedPct } from '@/lib/format';
import dayjs from 'dayjs';

const priceFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function PriceSparkline({
  series,
  height = 60,
  color,
}: {
  /** Historique de l'horizon (timestamps en secondes, clôtures en devise native). */
  series: { t: number[]; c: number[] } | null | undefined;
  height?: number;
  /** Couleur de tendance haussière ; par défaut `colorSuccess` du thème. */
  color?: string;
}) {
  const { token } = theme.useToken();

  if (!series || !series.c.length) {
    return (
      <div
        style={{
          height,
          display: 'grid',
          placeItems: 'center',
          color: token.colorTextSecondary,
          fontSize: 12,
        }}
      >
        pas de données
      </div>
    );
  }

  // Date format adapté à la durée affichée
  const spanDays =
    series.t.length > 1
      ? (series.t[series.t.length - 1] - series.t[0]) / 86400
      : 0;
  const dateFormat = spanDays > 365 * 2 ? 'MMM YY' : 'DD MMM';
  const tooltipFormat = spanDays > 365 ? 'DD MMM YYYY' : 'DD MMM';

  const data = series.t.map((t, i) => ({
    date: dayjs.unix(t).format(dateFormat),
    fullDate: dayjs.unix(t).format(tooltipFormat),
    price: series.c[i],
  }));
  const first = series.c[0];
  const last = series.c[series.c.length - 1];
  const up = last >= first;
  const trendColor = up ? (color ?? token.colorSuccess) : token.colorError;
  const periodChangePct = first > 0 ? ((last - first) / first) * 100 : null;

  // Réduit le nombre de ticks affichés pour rester lisible
  const tickCount = Math.min(6, data.length);
  const tickInterval = Math.max(0, Math.floor(data.length / tickCount) - 1);

  return (
    // Le graphique n'est pas lisible par un lecteur d'écran : on en donne le résumé.
    <div
      role="img"
      aria-label={`Évolution du cours sur la période : ${formatSignedPct(periodChangePct)}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={token.colorBorderSecondary}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fill: token.colorTextSecondary, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: token.colorBorderSecondary }}
            interval={tickInterval}
            minTickGap={20}
          />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            contentStyle={{
              background: token.colorBgElevated,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 6,
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
            }}
            itemStyle={{ color: token.colorText }}
            formatter={(v: number) => priceFormatter.format(v)}
            labelFormatter={(_, payload) =>
              (payload as { payload?: { fullDate?: string } }[])?.[0]?.payload?.fullDate ?? ''
            }
            labelStyle={{ color: token.colorTextSecondary }}
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
    </div>
  );
}
