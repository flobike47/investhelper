import { Card, Col, Row, Space, Tag, Typography, Skeleton, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCandles, useCompanyNews } from '@/hooks/useStockData';
import { useTickerSentiment } from '@/hooks/useNewsAnalysis';
import { useNextEarnings } from '@/hooks/useEarnings';
import { HORIZONS, type Horizon } from '@/constants/horizons';
import { rsi } from '@/lib/indicators';
import { lastDefined } from '@/lib/indicators';
import { findRsiAnalog, pickBucketFromRsi } from '@/lib/historicalAnalog';

const SENTIMENT_COLORS = {
  positive: 'green',
  negative: 'red',
  neutral: 'default',
  mixed: 'gold',
} as const;

const SENTIMENT_LABELS = {
  positive: 'Positif',
  negative: 'Négatif',
  neutral: 'Neutre',
  mixed: 'Mitigé',
} as const;

function horizonToAnalogDays(h: Horizon): number {
  return h === 'short' ? 21 : h === 'medium' ? 63 : 252;
}

export function StockInsight({ symbol, horizon }: { symbol: string; horizon: Horizon }) {
  const cfg = HORIZONS[horizon];
  const { data: candle } = useCandles(symbol, cfg);
  const { data: news } = useCompanyNews(symbol, 14);
  const sentiment = useTickerSentiment(symbol);
  const earnings = useNextEarnings(symbol);

  const currentRsi =
    candle && candle.s === 'ok' ? lastDefined(rsi(candle.c, cfg.rsiPeriod)) : null;

  const analog = findRsiAnalog(candle, {
    rsiBucket: pickBucketFromRsi(currentRsi),
    horizonDays: horizonToAnalogDays(horizon),
    rsiPeriod: cfg.rsiPeriod,
  });

  return (
    <Card
      size="small"
      title={
        <Space>
          <Typography.Text strong>{symbol}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            ({news?.length ?? 0} actus 14j)
          </Typography.Text>
        </Space>
      }
    >
      <Row gutter={[16, 12]}>
        <Col xs={24} md={10}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Sentiment news (Mistral)
          </Typography.Text>
          <div style={{ marginTop: 4 }}>
            {sentiment.isLoading ? (
              <Skeleton.Input active size="small" />
            ) : sentiment.isError ? (
              <Tag color="red">Erreur Mistral</Tag>
            ) : sentiment.data ? (
              <Space wrap>
                <Tag color={SENTIMENT_COLORS[sentiment.data.sentiment]}>
                  {SENTIMENT_LABELS[sentiment.data.sentiment]}{' '}
                  ({(sentiment.data.score * 100).toFixed(0)})
                </Tag>
                {sentiment.data.drivers.slice(0, 3).map((d) => (
                  <Tag key={d}>{d}</Tag>
                ))}
              </Space>
            ) : null}
          </div>
          {sentiment.data?.summary && (
            <Typography.Paragraph
              type="secondary"
              style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}
            >
              {sentiment.data.summary}
            </Typography.Paragraph>
          )}
        </Col>

        <Col xs={12} md={7}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Prochains résultats
          </Typography.Text>
          <div style={{ marginTop: 4 }}>
            {earnings.isLoading ? (
              <Skeleton.Input active size="small" />
            ) : earnings.data ? (
              <Space direction="vertical" size={2}>
                <Typography.Text strong>
                  {dayjs(earnings.data.date).format('DD MMM YYYY')}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {earnings.data.hour === 'bmo'
                    ? 'avant ouverture'
                    : earnings.data.hour === 'amc'
                    ? 'après clôture'
                    : 'horaire non précisé'}
                  {earnings.data.epsEstimate !== null &&
                    ` · EPS attendu ${earnings.data.epsEstimate.toFixed(2)}`}
                </Typography.Text>
              </Space>
            ) : (
              <Typography.Text type="secondary">aucune date annoncée</Typography.Text>
            )}
          </div>
        </Col>

        <Col xs={12} md={7}>
          <Space size={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Analog historique
            </Typography.Text>
            <Tooltip
              title={
                <>
                  Médiane des retours observés sur l'historique réel de {symbol}, après les
                  périodes où le RSI était dans le même bucket qu'aujourd'hui. Ce n'est pas
                  une prédiction, c'est la statistique du passé sur ce titre.
                </>
              }
            >
              <InfoCircleOutlined style={{ color: '#9ca3af', fontSize: 12 }} />
            </Tooltip>
          </Space>
          <div style={{ marginTop: 4 }}>
            {analog && analog.occurrences > 0 ? (
              <Space direction="vertical" size={2}>
                <Typography.Text strong>
                  {analog.medianReturn !== null
                    ? `${(analog.medianReturn * 100).toFixed(1)}%`
                    : '—'}{' '}
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    médian sur {analog.horizonDays}j
                  </Typography.Text>
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {analog.setupLabel} · {analog.occurrences} occurrences ·{' '}
                  {((analog.positiveRatio ?? 0) * 100).toFixed(0)}% positifs
                </Typography.Text>
              </Space>
            ) : (
              <Typography.Text type="secondary">
                pas assez d'occurrences historiques
              </Typography.Text>
            )}
          </div>
        </Col>
      </Row>
    </Card>
  );
}
