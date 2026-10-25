import { Skeleton, theme } from 'antd';
import dayjs from 'dayjs';
import { useTrackRecord } from '@/hooks/useTrackRecord';
import { formatSignedPct } from '@/lib/format';
import { describeError } from '@/lib/watchlistSummary';
import type { Horizon } from '@/constants/horizons';
import type { TrackWindowId, TrackWindowStats } from '@/types/signals';

const WINDOWS: { id: TrackWindowId; label: string }[] = [
  { id: '1m', label: '1 mois' },
  { id: '3m', label: '3 mois' },
  { id: '12m', label: '12 mois' },
];
const SIGNALS = [
  { id: 'buy', label: 'Signal haussier' },
  { id: 'hold', label: 'Neutre' },
  { id: 'sell', label: 'Signal baissier' },
] as const;

function Cell({ s, benchmark }: { s: TrackWindowStats; benchmark: string }) {
  const { token } = theme.useToken();
  if (!s.significant || s.medianReturn === null) {
    return (
      <span style={{ fontSize: 13, color: token.colorTextTertiary }}>
        {s.n === 0 ? '—' : `${s.n} cas, trop peu`}
      </span>
    );
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="tabular-nums" style={{ fontWeight: 650 }}>
        {formatSignedPct(s.medianReturn * 100, 1)}
      </span>
      <span className="tabular-nums" style={{ fontSize: 12, color: token.colorTextSecondary }}>
        {s.medianExcess !== null ? `${formatSignedPct(s.medianExcess * 100, 1)} vs ${benchmark} · ` : ''}
        {s.n} cas
      </span>
    </span>
  );
}

/**
 * Ce que les signaux de l'app ont réellement donné : rendement médian après
 * 1, 3 et 12 mois, comparé au S&P 500 (SPY) sur les mêmes dates. Tant que
 * l'échantillon est trop petit, on le dit plutôt que d'afficher un chiffre.
 */
export function SignalTrackRecord({ horizon }: { horizon: Horizon }) {
  const { token } = theme.useToken();
  const { data, isLoading, error } = useTrackRecord(horizon);
  const card = { background: token.colorBgContainer, borderRadius: 16, border: `1px solid ${token.colorBorderSecondary}` };
  const anySignificant =
    data && SIGNALS.some((sig) => WINDOWS.some((w) => data.bySignal[sig.id][w.id].significant));

  return (
    <section aria-labelledby="track-title" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 id="track-title" style={{ margin: '0 4px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
        Historique des signaux
      </h2>
      <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isLoading && <Skeleton active paragraph={{ rows: 3 }} />}
        {error && <span style={{ fontSize: 14, color: token.colorErrorText }}>Historique indisponible : {describeError(error)}</span>}
        {data && !anySignificant && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: token.colorTextSecondary }}>
            Pas encore assez de recul pour juger les signaux
            {data.since ? ` (suivi depuis le ${dayjs(data.since).format('D MMMM YYYY')})` : ''}. Le résultat s'affichera dès 8
            changements de signal mesurés.
          </p>
        )}
        {data && anySignificant && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', fontWeight: 600, color: token.colorTextSecondary, paddingBottom: 6 }}>
                  Après
                </th>
                {WINDOWS.map((w) => (
                  <th key={w.id} scope="col" style={{ textAlign: 'left', fontWeight: 600, color: token.colorTextSecondary, paddingBottom: 6 }}>
                    {w.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SIGNALS.map((sig) => (
                <tr key={sig.id} style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 600, padding: '8px 8px 8px 0' }}>
                    {sig.label}
                  </th>
                  {WINDOWS.map((w) => (
                    <td key={w.id} style={{ padding: '8px 8px 8px 0', verticalAlign: 'top' }}>
                      <Cell s={data.bySignal[sig.id][w.id]} benchmark={data.benchmark} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <span style={{ fontSize: 12, color: token.colorTextTertiary, lineHeight: 1.4 }}>
          Rendement médian réel des signaux émis par l'app, en devise de cotation, un cas par changement de signal. Le
          suivi commence à l'ajout d'une valeur : pas de reconstitution du passé. Statistique du passé, pas une prévision.
        </span>
      </div>
    </section>
  );
}
