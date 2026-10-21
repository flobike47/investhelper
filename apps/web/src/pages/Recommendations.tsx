import {
  Alert,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useUserSettings } from '@/hooks/useUserSettings';
import { HORIZONS, HORIZON_LIST, type Horizon } from '@/constants/horizons';
import { useThematicPicks, type ThematicPick } from '@/hooks/useThematicPicks';
import { useCandles, useCompanyNews } from '@/hooks/useStockData';
import { useTickerSentiment } from '@/hooks/useNewsAnalysis';
import { useFxRates } from '@/hooks/useFx';
import { PriceSparkline } from '@/components/stocks/PriceSparkline';
import { SignalTag } from '@/components/common/SignalTag';
import { buildPlaybook } from '@/lib/playbook';
import { findRsiAnalog, pickBucketFromRsi } from '@/lib/historicalAnalog';
import { lastDefined, rsi } from '@/lib/indicators';
import { formatEur, formatNative, inferCurrency, priceToEur } from '@/lib/currency';
import { describeError } from '@/lib/watchlistSummary';
import { formatSignedPct } from '@/lib/format';
import { SENTIMENT_LABELS } from '@/components/stocks/sentiment';

function ThemeBanner({ themes }: { themes: { name: string; direction: string; summary: string }[] }) {
  return (
    <Card>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Typography.Text strong>Thèmes dominants dans l'actualité (analyse IA Gemini)</Typography.Text>
        <Space wrap>
          {themes.map((t) => (
            <Tag
              key={t.name}
              color={t.direction === 'bullish' ? 'green' : t.direction === 'bearish' ? 'red' : 'default'}
            >
              {t.name} ({t.direction})
            </Tag>
          ))}
        </Space>
        <Space direction="vertical" size={4}>
          {themes.map((t) => (
            <Typography.Text key={t.name} type="secondary" style={{ fontSize: 12 }}>
              <strong>{t.name}</strong> : {t.summary}
            </Typography.Text>
          ))}
        </Space>
      </Space>
    </Card>
  );
}

/** Liste compacte des erreurs de candidats (les premières suffisent à diagnostiquer). */
function PickErrorList({ errors }: { errors: { symbol: string; error: Error }[] }) {
  const shown = errors.slice(0, 5);
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {shown.map(({ symbol, error }) => (
        <li key={symbol}>
          <strong>{symbol}</strong> : {describeError(error)}
        </li>
      ))}
      {errors.length > shown.length && <li>… et {errors.length - shown.length} autre(s)</li>}
    </ul>
  );
}

function horizonToAnalogDays(h: Horizon): number {
  return h === 'short' ? 21 : h === 'medium' ? 63 : 252;
}

function PickCard({ rank, pick, horizon }: { rank: number; pick: ThematicPick; horizon: Horizon }) {
  const cfg = HORIZONS[horizon];
  const { data: candle } = useCandles(pick.ticker.symbol, cfg);
  const { data: news } = useCompanyNews(pick.ticker.symbol, 14);
  const sentiment = useTickerSentiment(pick.ticker.symbol);
  const { data: rates } = useFxRates();
  const { token } = theme.useToken();

  const currentRsi =
    candle && candle.s === 'ok' ? lastDefined(rsi(candle.c, cfg.rsiPeriod)) : null;
  const analog = findRsiAnalog(candle, {
    rsiBucket: pickBucketFromRsi(currentRsi),
    horizonDays: horizonToAnalogDays(horizon),
    rsiPeriod: cfg.rsiPeriod,
  });

  const nativeCurrency = inferCurrency(pick.ticker.symbol);
  // Sans taux de change, on renvoie null plutôt qu'un montant natif étiqueté en euros
  // (convertToEur laisse le montant brut quand le taux manque).
  const toEur = (v: number | null | undefined): number | null => {
    if (v === null || v === undefined || !Number.isFinite(v)) return null;
    if (nativeCurrency === 'EUR') return v;
    const rate = rates?.[nativeCurrency];
    return rate ? v / rate : null;
  };

  const playbook = buildPlaybook({
    horizon,
    currentPrice: toEur(pick.ticker.price),
    entry: toEur(pick.ticker.score?.technical.entry ?? null),
    exit: toEur(pick.ticker.score?.technical.exit ?? null),
    smaShort: toEur(pick.ticker.score?.technical.smaShort ?? null),
    smaLong: toEur(pick.ticker.score?.technical.smaLong ?? null),
    targetMean: toEur(pick.ticker.score?.analyst.targetMean ?? null),
  });

  const s = pick.ticker.score!;

  return (
    <Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={4}>
          <Space direction="vertical" size={4}>
            <Tag color="blue">#{rank}</Tag>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {pick.ticker.symbol}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {pick.entry.name}
            </Typography.Text>
            <SignalTag signal={s.signal} />
          </Space>
        </Col>

        <Col xs={24} md={6}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Pourquoi ce titre ressort maintenant
          </Typography.Text>
          <Space direction="vertical" size={4} style={{ marginTop: 6 }}>
            {pick.themes.length > 0 ? (
              <Space wrap>
                {pick.themes.map((t) => (
                  <Tag key={t} color="cyan">{t}</Tag>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">Pas de thème d'actualité matchant.</Typography.Text>
            )}
            {sentiment.data && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Sentiment news 14j : <strong>{SENTIMENT_LABELS[sentiment.data.sentiment]}</strong>{' '}
                <span className="tabular-nums">({news ? news.length : '…'} articles)</span>
              </Typography.Text>
            )}
          </Space>
        </Col>

        <Col xs={24} md={8}>
          <PriceSparkline candle={candle} height={110} />
        </Col>

        <Col xs={12} md={3}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Prix actuel
          </Typography.Text>
          <div className="tabular-nums" style={{ fontWeight: 700, fontSize: 18 }}>
            {priceToEur(pick.ticker.price, pick.ticker.symbol, rates)}
          </div>
          {nativeCurrency !== 'EUR' && pick.ticker.price !== null && (
            <Typography.Text type="secondary" className="tabular-nums" style={{ fontSize: 11 }}>
              soit {formatNative(pick.ticker.price, nativeCurrency)}
            </Typography.Text>
          )}
        </Col>

        <Col xs={12} md={3}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Score global
          </Typography.Text>
          <Progress
            className="tabular-nums"
            percent={Math.round((s.score + 100) / 2)}
            format={() => `${s.score}`}
            strokeColor={
              s.score >= 30
                ? token.colorSuccess
                : s.score <= -30
                  ? token.colorError
                  : token.colorWarning
            }
            size="small"
            aria-label={`Score global ${s.score} sur une échelle de -100 à 100`}
          />
        </Col>

        <Col span={24}>
          <Card type="inner" size="small" title={`Plan d'action — ${cfg.label}`}>
            <Row gutter={[16, 12]}>
              <Col xs={24} md={8}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Horizon de détention
                </Typography.Text>
                <div style={{ fontWeight: 600 }}>{playbook.holdingPeriod}</div>
              </Col>
              <Col xs={24} md={16}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Fenêtre d'entrée
                </Typography.Text>
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  {playbook.entryWindow}
                </Typography.Paragraph>
              </Col>
              <Col span={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Conditions de sortie
                </Typography.Text>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
                  {playbook.exitConditions.map((c, i) => (
                    <li key={i}>
                      <Typography.Text>{c}</Typography.Text>
                    </li>
                  ))}
                </ul>
              </Col>
              <Col span={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Gestion du risque
                </Typography.Text>
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  {playbook.risk}
                </Typography.Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col span={24}>
          <Space wrap>
            {s.technical.rationale.map((r, i) => (
              <Tag key={i}>{r}</Tag>
            ))}
            {s.analyst.totalAnalysts > 0 && (
              <Tag color="cyan" className="tabular-nums">
                {s.analyst.totalAnalysts} analystes · {(s.analyst.buyRatio * 100).toFixed(0)}% buy
                {s.analyst.targetMean !== null &&
                  ` · cible ${formatEur(toEur(s.analyst.targetMean))}`}
              </Tag>
            )}
            {analog && analog.occurrences > 0 && analog.medianReturn !== null && (
              <Tag color="purple" className="tabular-nums">
                Analog passé : {formatSignedPct(analog.medianReturn * 100, 1)} médian sur{' '}
                {analog.horizonDays}j ({analog.occurrences} cas
                {analog.positiveRatio !== null &&
                  `, ${(analog.positiveRatio * 100).toFixed(0)}\u202f% positifs`}
                )
              </Tag>
            )}
          </Space>
        </Col>
      </Row>
    </Card>
  );
}

export default function Recommendations() {
  const { horizon, setHorizon } = useUserSettings();
  const { themes, themesLoading, themesError, picks, picksLoading, picksErrors } =
    useThematicPicks(horizon, 5);
  const themesReady = !themesLoading && !themesError;
  const allPicksFailed = themesReady && !picksLoading && picks.length === 0 && picksErrors.length > 0;

  return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              Recommandations pilotées par l'actualité
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

        <Alert
          type="warning"
          showIcon
          message="Ce ne sont pas des conseils financiers"
          description={
            <>
              Les 5 titres ci-dessous sont sélectionnés depuis un univers curé (~70 actions/ETF)
              en croisant : <strong>thèmes dominants extraits de l'actualité par l'IA (Gemini)</strong>,{' '}
              <strong>consensus analystes</strong> et <strong>signaux techniques</strong>.{' '}
              <strong>Aucune date d'achat/vente précise n'est prédite</strong> — on te donne des
              fenêtres conditionnelles et un horizon de détention. La décision finale et le
              risque restent à toi.
            </>
          }
        />

        {themesLoading && <Skeleton active />}
        {themesError && (
          <Alert
            type="error"
            showIcon
            message="Analyse IA des thèmes indisponible"
            description={describeError(themesError)}
          />
        )}
        {themes && themes.length > 0 && <ThemeBanner themes={themes} />}

        {allPicksFailed && (
          <Alert
            type="error"
            showIcon
            message="Impossible d'analyser les titres candidats"
            description={<PickErrorList errors={picksErrors} />}
          />
        )}
        {themesReady && !picksLoading && picks.length > 0 && picksErrors.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`${picksErrors.length} titre(s) candidat(s) non analysé(s), exclu(s) du classement`}
            description={<PickErrorList errors={picksErrors} />}
          />
        )}
        {themesReady && !picksLoading && picks.length === 0 && picksErrors.length === 0 && (
          <Empty description="Aucune recommandation calculable pour l'instant." />
        )}
        {picksLoading && <Skeleton active paragraph={{ rows: 6 }} />}

        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {picks.map((p, i) => (
            <PickCard key={p.ticker.symbol} rank={i + 1} pick={p} horizon={horizon} />
          ))}
        </Space>
      </Space>
  );
}
