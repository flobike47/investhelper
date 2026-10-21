import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Row,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Typography,
  theme,
} from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useWatchlist } from '@/hooks/useWatchlist';
import { HORIZONS, HORIZON_LIST, type Horizon } from '@/constants/horizons';
import { useAnalyzedTickers } from '@/hooks/useStockData';
import { useMarketNews } from '@/hooks/useNews';
import { StockRow } from '@/components/stocks/StockRow';
import { StockInsight } from '@/components/stocks/StockInsight';
import { describeError, summarizeWatchlist, trendOf } from '@/lib/watchlistSummary';
import { formatSignedPct } from '@/lib/format';
import dayjs from 'dayjs';

export default function Dashboard() {
  const { horizon, setHorizon } = useUserSettings();
  const { tickers, loading: watchlistLoading, error: watchlistError } = useWatchlist();
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const analyzed = useAnalyzedTickers(tickers, HORIZONS[horizon]);
  const news = useMarketNews();

  const summary = summarizeWatchlist(analyzed);
  // Une watchlist en erreur n'est pas « vide » : on affiche l'erreur à la place.
  const watchlistEmpty = !watchlistLoading && !watchlistError && tickers.length === 0;

  // Variation moyenne : chargement tant qu'aucune valeur n'est arrivée,
  // « — » neutre si plus rien n'est attendu et qu'aucune n'est disponible.
  const avgLoading =
    watchlistLoading || (summary.avgChangePct === null && summary.pendingCount > 0);
  const avgTrend = trendOf(summary.avgChangePct);
  const avgColor =
    avgTrend === 'up'
      ? token.colorSuccessText
      : avgTrend === 'down'
        ? token.colorErrorText
        : token.colorTextSecondary;

  const buyLoading =
    watchlistLoading || (summary.scoredCount === 0 && summary.pendingCount > 0);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={[16, 16]} align="middle" justify="space-between">
        <Col>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Tableau de bord
          </Typography.Title>
          <Typography.Text type="secondary">{HORIZONS[horizon].description}</Typography.Text>
        </Col>
        <Col>
          <Segmented<Horizon>
            value={horizon}
            onChange={(v) => setHorizon(v)}
            options={HORIZON_LIST.map((h) => ({ label: h.label, value: h.id }))}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              className="tabular-nums"
              title="Watchlist suivie"
              loading={watchlistLoading}
              value={tickers.length}
              suffix="actifs"
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              className="tabular-nums"
              title="Variation moyenne (jour)"
              loading={avgLoading}
              value={formatSignedPct(summary.avgChangePct)}
              valueStyle={{ color: avgColor }}
              prefix={
                avgTrend === 'up' ? (
                  <ArrowUpOutlined aria-hidden />
                ) : avgTrend === 'down' ? (
                  <ArrowDownOutlined aria-hidden />
                ) : undefined
              }
            />
            {!avgLoading && summary.changeSampleSize < tickers.length && (
              <Typography.Text type="secondary" className="tabular-nums" style={{ fontSize: 12 }}>
                sur {summary.changeSampleSize} / {tickers.length} actifs disponibles
              </Typography.Text>
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              className="tabular-nums"
              title="Signal d'achat"
              loading={buyLoading}
              value={summary.scoredCount > 0 ? summary.buyCount : '—'}
              suffix={summary.scoredCount > 0 ? `/ ${summary.scoredCount} analysés` : undefined}
              valueStyle={{
                color: summary.buyCount > 0 ? token.colorSuccessText : token.colorTextSecondary,
              }}
            />
            {!buyLoading && summary.pendingCount > 0 && (
              <Typography.Text type="secondary" className="tabular-nums" style={{ fontSize: 12 }}>
                {summary.pendingCount} en cours d'analyse
              </Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Mes actifs">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {watchlistLoading && <Skeleton active paragraph={{ rows: 2 }} />}
          {watchlistError && (
            <Alert
              type="error"
              showIcon
              message="Impossible de charger votre watchlist"
              description={watchlistError.message}
            />
          )}
          {watchlistEmpty && (
            <Empty description="Votre watchlist est vide">
              <Button type="primary" onClick={() => navigate('/watchlist')}>
                Ajouter des actifs
              </Button>
            </Empty>
          )}
          {analyzed.map((t) =>
            t.loading ? (
              <Skeleton key={t.symbol} active paragraph={{ rows: 1 }} />
            ) : (
              <StockRow key={t.symbol} data={t} horizon={horizon} />
            ),
          )}
        </Space>
      </Card>

      {tickers.length > 0 && (
        <Card
          title="Analyse par actif"
          extra={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Sentiment news · earnings · analog historique
            </Typography.Text>
          }
        >
          {/*
            Chargement paresseux : chaque analyse déclenche news, earnings et un
            sentiment IA (quota Gemini). Les panneaux sont fermés par défaut et
            antd ne monte le contenu d'un panneau qu'à sa première ouverture :
            les requêtes ne partent que pour les actifs que l'utilisateur ouvre.
          */}
          <Collapse
            items={tickers.map((symbol) => ({
              key: symbol,
              label: <Typography.Text strong>{symbol}</Typography.Text>,
              children: <StockInsight symbol={symbol} horizon={horizon} />,
            }))}
          />
        </Card>
      )}

      <Card title="Actualités marchés" loading={news.isLoading}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {news.isError && (
            <Alert
              type="error"
              showIcon
              message="Impossible de charger les actualités"
              description={describeError(news.error)}
              action={
                <Button size="small" onClick={() => void news.refetch()}>
                  Réessayer
                </Button>
              }
            />
          )}
          {(news.data?.articles ?? []).slice(0, 6).map((a) => (
            <a
              key={a.url}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block' }}
            >
              <Typography.Text strong>{a.title}</Typography.Text>
              <br />
              <Typography.Text type="secondary" className="tabular-nums" style={{ fontSize: 12 }}>
                {a.source.name} · {dayjs(a.publishedAt).format('DD MMM HH:mm')}
              </Typography.Text>
            </a>
          ))}
        </Space>
      </Card>
    </Space>
  );
}
