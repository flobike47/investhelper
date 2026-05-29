import { Card, Col, Row, Space, Tooltip, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { useCandles } from '@/hooks/useStockData';
import { useFxRates } from '@/hooks/useFx';
import { HORIZONS, type Horizon } from '@/constants/horizons';
import { PriceSparkline } from './PriceSparkline';
import { SignalTag } from '../common/SignalTag';
import { inferCurrency, priceToEur } from '@/lib/currency';
import type { AnalyzedTicker } from '@/hooks/useStockData';

export function StockRow({ data, horizon }: { data: AnalyzedTicker; horizon: Horizon }) {
  const cfg = HORIZONS[horizon];
  const { data: candle } = useCandles(data.symbol, cfg);
  const { data: rates } = useFxRates();

  const up = (data.changePct ?? 0) >= 0;
  const nativeCurrency = inferCurrency(data.symbol);
  const eurPrice = priceToEur(data.price, data.symbol, rates);
  const tooltip =
    nativeCurrency === 'EUR'
      ? undefined
      : data.price !== null && data.price !== undefined
      ? `${data.price.toFixed(2)} ${nativeCurrency}`
      : undefined;

  return (
    <Card
      size="small"
      styles={{ body: { padding: 14 } }}
      style={{ borderColor: '#1f242e' }}
    >
      <Row gutter={[16, 12]} align="middle">
        <Col xs={12} md={4}>
          <Space direction="vertical" size={0}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {data.symbol}
            </Typography.Text>
            {data.score && <SignalTag signal={data.score.signal} />}
          </Space>
        </Col>
        <Col xs={12} md={4}>
          <Space direction="vertical" size={0}>
            <Tooltip title={tooltip}>
              <Typography.Text strong style={{ fontSize: 18 }}>
                {eurPrice}
              </Typography.Text>
            </Tooltip>
            {nativeCurrency !== 'EUR' &&
              data.price !== null &&
              data.price !== undefined && (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {data.price.toFixed(2)} {nativeCurrency}
                </Typography.Text>
              )}
            {data.changePct !== null && (
              <span style={{ fontSize: 12, color: up ? '#22c55e' : '#ef4444' }}>
                {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                {data.changePct.toFixed(2)}%
              </span>
            )}
          </Space>
        </Col>
        <Col xs={24} md={10}>
          <PriceSparkline candle={candle} height={80} />
        </Col>
        <Col xs={12} md={3}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Entrée
          </Typography.Text>
          <div style={{ fontWeight: 600 }}>
            {priceToEur(data.score?.technical.entry ?? null, data.symbol, rates)}
          </div>
        </Col>
        <Col xs={12} md={3}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Sortie
          </Typography.Text>
          <div style={{ fontWeight: 600 }}>
            {priceToEur(data.score?.technical.exit ?? null, data.symbol, rates)}
          </div>
        </Col>
      </Row>
    </Card>
  );
}
