import { Card, Col, Row, Segmented, Skeleton, Space, Statistic, Typography, Empty } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useWatchlist } from '@/hooks/useWatchlist';
import { HORIZONS, HORIZON_LIST, type Horizon } from '@/constants/horizons';
import { useAnalyzedTickers } from '@/hooks/useStockData';
import { useMarketNews } from '@/hooks/useNews';
import { StockRow } from '@/components/stocks/StockRow';
import { StockInsight } from '@/components/stocks/StockInsight';
import dayjs from 'dayjs';

export default function Dashboard() {
  const { horizon, setHorizon } = useUserSettings();
  const { tickers } = useWatchlist();

  const analyzed = useAnalyzedTickers(tickers, HORIZONS[horizon]);
  const news = useMarketNews();

  const totalChange =
    analyzed.length > 0
      ? analyzed.reduce((sum, t) => sum + (t.changePct ?? 0), 0) / analyzed.length
      : 0;

  return (
    
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              Tableau de bord
            </Typography.Title>
            <Typography.Text type="secondary">
              {HORIZONS[horizon].description}
            </Typography.Text>
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
                title="Watchlist suivie"
                value={tickers.length}
                suffix="actifs"
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="Variation moyenne (jour)"
                value={totalChange}
                precision={2}
                suffix="%"
                valueStyle={{ color: totalChange >= 0 ? '#22c55e' : '#ef4444' }}
                prefix={totalChange >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="Signal d'achat"
                value={analyzed.filter((t) => t.score?.signal === 'buy').length}
                suffix={`/ ${tickers.length}`}
                valueStyle={{ color: '#22c55e' }}
              />
            </Card>
          </Col>
        </Row>

        <Card title="Mes actifs">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {analyzed.length === 0 && <Empty description="Watchlist vide" />}
            {analyzed.map((t) =>
              t.loading ? (
                <Skeleton key={t.symbol} active paragraph={{ rows: 1 }} />
              ) : (
                <StockRow key={t.symbol} data={t} horizon={horizon} />
              ),
            )}
          </Space>
        </Card>

        <Card
          title="Analyse par actif"
          extra={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Sentiment news · earnings · analog historique
            </Typography.Text>
          }
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {tickers.map((symbol) => (
              <StockInsight key={symbol} symbol={symbol} horizon={horizon} />
            ))}
          </Space>
        </Card>

        <Card title="Actualités marchés" loading={news.isLoading}>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
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
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {a.source.name} · {dayjs(a.publishedAt).format('DD MMM HH:mm')}
                </Typography.Text>
              </a>
            ))}
            {news.isError && (
              <Typography.Text type="danger">
                Erreur lors du chargement des actualités.
              </Typography.Text>
            )}
          </Space>
        </Card>
      </Space>
    
  );
}
