import { Card, Col, Row, Space, Tooltip, Typography, theme } from 'antd';
import { ExclamationCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useCandles } from '@/hooks/useStockData';
import { useFxRates } from '@/hooks/useFx';
import { HORIZONS, type Horizon } from '@/constants/horizons';
import { PriceSparkline } from './PriceSparkline';
import { ChangeIndicator } from './ChangeIndicator';
import { SignalTag } from '../common/SignalTag';
import { formatNative, inferCurrency, priceToEur } from '@/lib/currency';
import { describeError, tickerStatus } from '@/lib/watchlistSummary';
import type { AnalyzedTicker } from '@/hooks/useStockData';

/** Carte compacte quand aucune donnée du ticker n'est affichable. */
function StockRowError({ symbol, message }: { symbol: string; message: string }) {
  const { token } = theme.useToken();
  return (
    <Card size="small" styles={{ body: { padding: 14 } }}>
      <Space align="start" size={12} wrap>
        <Typography.Text strong style={{ fontSize: 16 }}>
          {symbol}
        </Typography.Text>
        <Typography.Text style={{ color: token.colorErrorText }}>
          <ExclamationCircleOutlined aria-hidden /> Données indisponibles : {message}
        </Typography.Text>
      </Space>
    </Card>
  );
}

export function StockRow({ data, horizon }: { data: AnalyzedTicker; horizon: Horizon }) {
  const cfg = HORIZONS[horizon];
  const { data: candle } = useCandles(data.symbol, cfg);
  const { data: rates } = useFxRates();
  const { token } = theme.useToken();

  const status = tickerStatus(data);
  const errorMessage = describeError(data.error);
  if (status === 'error' && errorMessage) {
    return <StockRowError symbol={data.symbol} message={errorMessage} />;
  }

  const nativeCurrency = inferCurrency(data.symbol);
  const eurPrice = priceToEur(data.price, data.symbol, rates);
  const hasNativePrice =
    nativeCurrency !== 'EUR' && data.price !== null && Number.isFinite(data.price);
  const nativePrice = hasNativePrice ? formatNative(data.price, nativeCurrency) : null;

  return (
    <Card size="small" styles={{ body: { padding: 14 } }}>
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
            <Tooltip title={nativePrice ?? undefined}>
              <Typography.Text strong className="tabular-nums" style={{ fontSize: 18 }}>
                {eurPrice}
              </Typography.Text>
            </Tooltip>
            {nativePrice && (
              <Typography.Text type="secondary" className="tabular-nums" style={{ fontSize: 11 }}>
                {nativePrice}
              </Typography.Text>
            )}
            {data.changePct !== null && <ChangeIndicator pct={data.changePct} />}
          </Space>
        </Col>
        <Col xs={24} md={10}>
          <PriceSparkline candle={candle} height={80} />
        </Col>
        <Col xs={12} md={3}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Entrée
          </Typography.Text>
          <div className="tabular-nums" style={{ fontWeight: 600 }}>
            {priceToEur(data.score?.technical.entry ?? null, data.symbol, rates)}
          </div>
        </Col>
        <Col xs={12} md={3}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Sortie
          </Typography.Text>
          <div className="tabular-nums" style={{ fontWeight: 600 }}>
            {priceToEur(data.score?.technical.exit ?? null, data.symbol, rates)}
          </div>
        </Col>
        {status === 'partial' && errorMessage && (
          <Col span={24}>
            {/* colorWarningText : contraste lisible en thème clair, contrairement à colorWarning */}
            <Typography.Text style={{ fontSize: 12, color: token.colorWarningText }}>
              <WarningOutlined aria-hidden /> Données partielles : {errorMessage}
            </Typography.Text>
          </Col>
        )}
      </Row>
    </Card>
  );
}
