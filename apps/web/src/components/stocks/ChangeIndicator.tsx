import { theme } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { trendOf } from '@/lib/watchlistSummary';
import { formatSignedPct } from '@/lib/format';

/**
 * Variation en % : flèche + signe explicite + couleur sémantique du thème.
 * Le sens ne repose jamais sur la seule couleur (flèche et signe « + »/« - »).
 * Une variation nulle reste neutre ; une variation inconnue affiche « — ».
 * Variantes `*Text` des tokens succès/erreur : même teinte, contraste suffisant
 * pour du texte en thème clair (le vert de base est trop pâle sur fond blanc).
 */
export function ChangeIndicator({
  pct,
  fontSize = 12,
}: {
  /** Variation en pourcentage (0-100), `null` si inconnue. */
  pct: number | null;
  fontSize?: number;
}) {
  const { token } = theme.useToken();
  const trend = trendOf(pct);
  const color =
    trend === 'up'
      ? token.colorSuccessText
      : trend === 'down'
        ? token.colorErrorText
        : token.colorTextSecondary;

  return (
    <span className="tabular-nums" style={{ fontSize, color, whiteSpace: 'nowrap' }}>
      {trend === 'up' && <ArrowUpOutlined aria-hidden style={{ marginRight: 4 }} />}
      {trend === 'down' && <ArrowDownOutlined aria-hidden style={{ marginRight: 4 }} />}
      {formatSignedPct(pct)}
    </span>
  );
}
