import { Skeleton, theme } from 'antd';
import { Link } from 'react-router-dom';
import type { TickerView } from '@/hooks/useSignals';
import { formatMoney } from '@/lib/currency';
import { formatSignedPct } from '@/lib/format';
import { describeError, tickerStatus, trendOf } from '@/lib/watchlistSummary';
import { MiniSparkline } from './MiniSparkline';

const SIGNAL_LABELS = { buy: 'Signal haussier', hold: 'Neutre', sell: 'Signal baissier', unknown: '' } as const;

/**
 * Ligne de liste d'un actif : symbole, nom ou signal, mini-courbe, cours en €
 * et variation du jour. Toute la ligne ouvre la fiche (`to`).
 */
export function AssetRow({
  data,
  to,
  selected = false,
  label,
}: {
  data: TickerView;
  to: string;
  selected?: boolean;
  /** Ligne secondaire (par défaut : nom connu de l'actif). */
  label?: string;
}) {
  const { token } = theme.useToken();
  const status = tickerStatus(data);
  const name = label ?? data.name;
  const trend = trendOf(data.changePct);
  const tone =
    trend === 'up' ? token.colorSuccessText : trend === 'down' ? token.colorErrorText : token.colorTextSecondary;
  const toneBg =
    trend === 'up' ? token.colorSuccessBg : trend === 'down' ? token.colorErrorBg : token.colorFillTertiary;
  const signal = data.signal;
  const price = formatMoney(data.price, data.currency);
  const pct = formatSignedPct(data.changePct);
  const error = status === 'error' ? describeError(data.error) : null;

  return (
    <Link
      to={to}
      aria-current={selected ? 'true' : undefined}
      aria-label={`${data.symbol}${name ? `, ${name}` : ''}${error ? ', données indisponibles' : `, ${price}, ${pct} aujourd'hui`}. Ouvrir la fiche`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 64px 96px',
        alignItems: 'center',
        gap: 12,
        minHeight: 64,
        padding: '10px 16px',
        color: token.colorText,
        background: selected ? token.colorFillSecondary : 'transparent',
        boxShadow: selected ? `inset 3px 0 0 ${token.colorPrimary}` : undefined,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 650 }}>{data.symbol}</span>
        <span
          style={{
            fontSize: 13,
            color: error ? token.colorErrorText : token.colorTextSecondary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {error ? 'Données indisponibles' : [name, SIGNAL_LABELS[signal]].filter(Boolean).join(' · ') || ' '}
        </span>
      </span>
      {status === 'loading' ? <span /> : <MiniSparkline closes={data.closes} />}
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {status === 'loading' ? (
          <Skeleton.Input active size="small" style={{ width: 80, minWidth: 80 }} />
        ) : (
          <>
            <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 600 }}>
              {price}
            </span>
            <span
              className="tabular-nums"
              style={{ fontSize: 13, fontWeight: 650, padding: '2px 6px', borderRadius: 6, color: tone, background: toneBg }}
            >
              {pct}
            </span>
          </>
        )}
      </span>
    </Link>
  );
}
