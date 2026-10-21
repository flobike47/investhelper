import type { ReactNode } from 'react';
import { Alert, Empty, Segmented, Skeleton, theme } from 'antd';
import dayjs from 'dayjs';
import { useLocation } from 'react-router-dom';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useAnalyzedTickers } from '@/hooks/useStockData';
import { HORIZONS, HORIZON_LIST, type Horizon } from '@/constants/horizons';
import { summarizeWatchlist, trendOf } from '@/lib/watchlistSummary';
import { formatSignedPct } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { IosInstallHint } from '@/components/common/IosInstallHint';
import { MasterDetail } from '@/components/layout/MasterDetail';
import { AddTickerSearch } from '@/components/stocks/AddTickerSearch';
import { AssetRow } from '@/components/stocks/AssetRow';

function Stat({ label, value, hint, color, loading }: {
  label: string;
  value: ReactNode;
  hint: string;
  color?: string;
  loading: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: token.colorTextSecondary }}>{label}</span>
      {loading ? (
        <Skeleton.Input active size="small" style={{ width: 96, minWidth: 96, height: 34 }} />
      ) : (
        <span className="tabular-nums" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: color ?? token.colorText }}>
          {value}
        </span>
      )}
      <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{hint}</span>
    </div>
  );
}

/** Accueil : la watchlist, son résumé du jour, et la fiche de l'actif sélectionné. */
export default function Home() {
  const { token } = theme.useToken();
  const { pathname } = useLocation();
  const { horizon, setHorizon } = useUserSettings();
  const { tickers, loading, error } = useWatchlist();
  const analyzed = useAnalyzedTickers(tickers, HORIZONS[horizon]);
  const summary = summarizeWatchlist(analyzed);
  const selected = decodeURIComponent(pathname.match(/^\/asset\/([^/]+)/)?.[1] ?? '').toUpperCase();

  const avgTrend = trendOf(summary.avgChangePct);
  const avgColor =
    avgTrend === 'up' ? token.colorSuccessText : avgTrend === 'down' ? token.colorErrorText : token.colorTextSecondary;
  const empty = !loading && !error && tickers.length === 0;
  const card = { background: token.colorBgContainer, borderRadius: 16, border: `1px solid ${token.colorBorderSecondary}` };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader eyebrow={dayjs().format('dddd D MMMM')} title="Ma watchlist" />
      <IosInstallHint />
      <MasterDetail placeholder="Sélectionne un actif pour afficher sa fiche.">
        <AddTickerSearch />

        <Segmented<Horizon>
          block
          aria-label="Horizon d'investissement"
          value={horizon}
          onChange={setHorizon}
          options={HORIZON_LIST.map((h) => ({ label: h.label, value: h.id }))}
        />

        <section aria-label="Résumé du jour" style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Stat
            label="Variation moyenne"
            loading={loading || (summary.avgChangePct === null && summary.pendingCount > 0)}
            value={formatSignedPct(summary.avgChangePct)}
            color={avgColor}
            hint={
              summary.changeSampleSize < tickers.length
                ? `sur ${summary.changeSampleSize} / ${tickers.length} actifs`
                : `sur ${tickers.length} actif${tickers.length > 1 ? 's' : ''}, aujourd'hui`
            }
          />
          <Stat
            label="Signaux haussiers"
            loading={loading || (summary.scoredCount === 0 && summary.pendingCount > 0)}
            value={
              summary.scoredCount > 0 ? (
                <>
                  {summary.buyCount}
                  <span style={{ fontSize: 17, color: token.colorTextTertiary }}> / {summary.scoredCount}</span>
                </>
              ) : (
                '—'
              )
            }
            hint={`horizon ${HORIZONS[horizon].label.toLowerCase()}`}
          />
        </section>

        <section aria-labelledby="assets-title" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 id="assets-title" style={{ margin: '0 4px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Actifs
          </h2>
          {error && <Alert type="error" showIcon message="Impossible de charger votre watchlist" description={error.message} />}
          {loading && <Skeleton active paragraph={{ rows: 4 }} />}
          {empty && (
            <div style={{ ...card, padding: 24 }}>
              <Empty description="Votre watchlist est vide. Ajoutez un actif avec le champ de recherche ci-dessus." />
            </div>
          )}
          {analyzed.length > 0 && (
            <div style={{ ...card, overflow: 'hidden' }}>
              {analyzed.map((t, i) => (
                <div key={t.symbol} style={{ borderTop: i === 0 ? undefined : `1px solid ${token.colorBorderSecondary}` }}>
                  <AssetRow data={t} horizon={horizon} to={`/asset/${encodeURIComponent(t.symbol)}`} selected={t.symbol === selected} />
                </div>
              ))}
            </div>
          )}
          <p style={{ margin: '4px 4px 0', fontSize: 12, color: token.colorTextTertiary, lineHeight: 1.4 }}>
            Indicateurs techniques et consensus d'analystes. Ce ne sont pas des conseils financiers.
          </p>
        </section>
      </MasterDetail>
    </div>
  );
}
