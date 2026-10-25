import type { ReactNode } from 'react';
import { App as AntApp, Alert, Button, Collapse, Skeleton, Tag, theme } from 'antd';
import { CloseOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAnalyzedTickers, useCandles, useCompanyNews, useProfile } from '@/hooks/useStockData';
import { useTickerSentiment } from '@/hooks/useNewsAnalysis';
import { useNextEarnings } from '@/hooks/useEarnings';
import { useFxRates } from '@/hooks/useFx';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useUserSettings } from '@/hooks/useUserSettings';
import { HORIZONS, analogBarsFor } from '@/constants/horizons';
import { findInUniverse } from '@/constants/universe';
import { lastDefined, rsi } from '@/lib/indicators';
import { findRsiAnalog, pickBucketFromRsi } from '@/lib/historicalAnalog';
import { buildPlaybook } from '@/lib/playbook';
import { convertToEur, formatEur, formatNative, inferCurrency, priceToEur } from '@/lib/currency';
import { formatSignedPct } from '@/lib/format';
import { describeError } from '@/lib/watchlistSummary';
import { SignalTag } from '@/components/common/SignalTag';
import { ChangeIndicator } from './ChangeIndicator';
import { PriceSparkline } from './PriceSparkline';
import { SENTIMENT_COLORS, SENTIMENT_LABELS } from './sentiment';

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>{children}</h3>;
}

/** Tuile chiffre + libellé (plan conditionnel). */
function Tile({ label, value }: { label: string; value: ReactNode }) {
  const { token } = theme.useToken();
  return (
    <div style={{ background: token.colorFillQuaternary, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{label}</span>
      <span className="tabular-nums" style={{ fontSize: 16, fontWeight: 650 }}>
        {value}
      </span>
    </div>
  );
}

/**
 * Fiche d'un actif : cours, graphique, signal expliqué, plan conditionnel et
 * contexte (sentiment IA, résultats, analogue historique). Affichée en panneau
 * sur mobile et en colonne sur PC. Le sentiment IA (quota Gemini) n'est
 * demandé qu'à l'ouverture de la fiche.
 */
export function AssetDetail({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const { token } = theme.useToken();
  const { modal } = AntApp.useApp();
  const { horizon } = useUserSettings();
  const cfg = HORIZONS[horizon];
  const [ticker] = useAnalyzedTickers([symbol], cfg);
  const { data: candle } = useCandles(symbol, cfg);
  const { data: news } = useCompanyNews(symbol, 14);
  const profile = useProfile(symbol);
  const sentiment = useTickerSentiment(symbol);
  const earnings = useNextEarnings(symbol);
  const { data: rates } = useFxRates();
  const watchlist = useWatchlist();

  const name = findInUniverse(symbol)?.name ?? profile.data?.name;
  const currency = inferCurrency(symbol);
  const toEur = (v: number | null | undefined) => convertToEur(v, currency, rates);
  const score = ticker.score;
  const inWatchlist = watchlist.tickers.includes(symbol);

  const currentRsi = candle && candle.s === 'ok' ? lastDefined(rsi(candle.c, cfg.rsiPeriod)) : null;
  const analog = findRsiAnalog(candle, {
    rsiBucket: pickBucketFromRsi(currentRsi),
    horizonBars: analogBarsFor(horizon),
    rsiPeriod: cfg.rsiPeriod,
  });
  const playbook = buildPlaybook({
    horizon,
    currentPrice: toEur(ticker.price),
    entry: toEur(score?.technical.entry ?? null),
    exit: toEur(score?.technical.exit ?? null),
    smaShort: toEur(score?.technical.smaShort ?? null),
    smaLong: toEur(score?.technical.smaLong ?? null),
    targetMean: toEur(score?.analyst.targetMean ?? null),
  });

  const confirmRemove = () =>
    modal.confirm({
      title: `Retirer ${symbol} de la watchlist ?`,
      okText: 'Retirer',
      okButtonProps: { danger: true },
      cancelText: 'Annuler',
      onOk: () => {
        watchlist.remove(symbol);
        onClose();
      },
    });

  const card = { background: token.colorFillQuaternary, borderRadius: 16 } as const;
  const divider = `1px solid ${token.colorBorderSecondary}`;

  return (
    <article aria-labelledby="asset-title" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <h2 id="asset-title" style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.015em' }}>
            {symbol}
          </h2>
          <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
            {[name, currency !== 'EUR' ? `coté en ${currency}` : null].filter(Boolean).join(' · ') || ' '}
          </span>
        </div>
        <Button
          shape="circle"
          type="text"
          aria-label="Fermer la fiche"
          icon={<CloseOutlined />}
          onClick={onClose}
          style={{ width: 44, height: 44, background: token.colorFillTertiary }}
        />
      </header>

      {ticker.error && !ticker.loading && ticker.price === null && (
        <Alert type="error" showIcon message="Données indisponibles" description={describeError(ticker.error)} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ticker.loading ? (
          <Skeleton.Input active size="large" style={{ width: 200 }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="tabular-nums" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.025em' }}>
              {priceToEur(ticker.price, symbol, rates)}
            </span>
            <ChangeIndicator pct={ticker.changePct} fontSize={15} />
            <span style={{ fontSize: 13, color: token.colorTextSecondary }}>aujourd'hui</span>
          </div>
        )}
        {currency !== 'EUR' && ticker.price !== null && (
          <span className="tabular-nums" style={{ fontSize: 13, color: token.colorTextSecondary }}>
            soit {formatNative(ticker.price, currency)} · converti au taux du jour
          </span>
        )}
      </div>

      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <PriceSparkline candle={candle} height={160} />
        <figcaption style={{ fontSize: 12, color: token.colorTextTertiary }}>
          Historique utilisé pour l'horizon {cfg.label.toLowerCase()}
        </figcaption>
      </figure>

      <section aria-label="Signal" style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Signal · {cfg.label.toLowerCase()}
          </span>
          {score ? <SignalTag signal={score.signal} /> : <Skeleton.Button active size="small" />}
        </div>
        {score && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: token.colorTextSecondary }}>
                <span>Baissier</span>
                <span className="tabular-nums" style={{ color: token.colorText, fontWeight: 650 }}>
                  Score {score.score > 0 ? '+' : ''}
                  {score.score}
                </span>
                <span>Haussier</span>
              </div>
              <div
                role="meter"
                aria-label="Score combiné"
                aria-valuemin={-100}
                aria-valuemax={100}
                aria-valuenow={score.score}
                style={{
                  position: 'relative',
                  height: 6,
                  borderRadius: 3,
                  background: `linear-gradient(90deg, ${token.colorError}, ${token.colorFillSecondary} 50%, ${token.colorSuccess})`,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: `${(score.score + 100) / 2}%`,
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    transform: 'translateX(-50%)',
                    background: token.colorText,
                    boxShadow: `0 0 0 3px ${token.colorBgContainer}`,
                  }}
                />
              </div>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.4 }}>
              {score.technical.rationale.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {score.analyst.totalAnalysts > 0 && (
                <li className="tabular-nums">
                  {(score.analyst.buyRatio * 100).toFixed(0)}&#8239;% des {score.analyst.totalAnalysts} analystes à l'achat
                  {score.analyst.targetMean !== null && `, objectif moyen ${formatEur(toEur(score.analyst.targetMean))}`}.
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="asset-plan" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionTitle>
          <span id="asset-plan">Plan conditionnel</span>
        </SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Tile label="Zone d'entrée" value={priceToEur(score?.technical.entry ?? null, symbol, rates)} />
          <Tile label="Seuil de sortie" value={priceToEur(score?.technical.exit ?? null, symbol, rates)} />
          <Tile label="Détention" value={playbook.holdingPeriod} />
        </div>
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'plan',
              label: 'Détails du plan',
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, lineHeight: 1.45 }}>
                  <p style={{ margin: 0 }}>{playbook.entryWindow}</p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {playbook.exitConditions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p style={{ margin: 0, color: token.colorTextSecondary }}>{playbook.risk}</p>
                </div>
              ),
            },
          ]}
        />
      </section>

      <section aria-labelledby="asset-context" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionTitle>
          <span id="asset-context">Contexte</span>
        </SectionTitle>
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Sentiment des actualités</span>
              {sentiment.isLoading ? (
                <Skeleton.Button active size="small" />
              ) : sentiment.data ? (
                <Tag color={SENTIMENT_COLORS[sentiment.data.sentiment]} style={{ marginInlineEnd: 0 }}>
                  {SENTIMENT_LABELS[sentiment.data.sentiment]}
                </Tag>
              ) : null}
            </div>
            {sentiment.isError && (
              <span style={{ fontSize: 13, color: token.colorErrorText }}>
                Analyse IA indisponible : {describeError(sentiment.error)}
              </span>
            )}
            {sentiment.data?.summary && (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: token.colorTextSecondary }}>
                {sentiment.data.summary}
              </p>
            )}
            <span className="tabular-nums" style={{ fontSize: 12, color: token.colorTextTertiary }}>
              {news ? `${news.length} articles sur 14 jours` : 'Articles en cours de chargement'} · analyse IA (Gemini)
            </span>
          </div>
          <div style={{ padding: '14px 16px', borderTop: divider, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Prochains résultats</span>
            <span className="tabular-nums" style={{ fontSize: 15, color: token.colorTextSecondary, textAlign: 'right' }}>
              {earnings.isLoading
                ? '…'
                : earnings.data
                  ? `${dayjs(earnings.data.date).format('D MMM')} · ${
                      earnings.data.hour === 'bmo' ? 'avant ouverture' : earnings.data.hour === 'amc' ? 'après clôture' : 'horaire non précisé'
                    }`
                  : 'aucune date annoncée'}
            </span>
          </div>
          <div style={{ padding: '14px 16px', borderTop: divider, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Analogue historique</span>
              <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 650 }}>
                {analog && analog.occurrences > 0 && analog.medianReturn !== null
                  ? `${formatSignedPct(analog.medianReturn * 100, 1)} médian`
                  : '—'}
              </span>
            </div>
            <span className="tabular-nums" style={{ fontSize: 13, color: token.colorTextSecondary, lineHeight: 1.4 }}>
              {analog && analog.occurrences > 0
                ? `Sur ${analog.horizonBars} ${cfg.barUnit}s après un RSI comparable · ${analog.occurrences} cas${
                    analog.positiveRatio !== null ? ` · ${(analog.positiveRatio * 100).toFixed(0)}\u202f% positifs` : ''
                  }. Statistique du passé, pas une prévision.`
                : "Pas assez d'occurrences historiques comparables."}
            </span>
          </div>
        </div>
      </section>

      {inWatchlist ? (
        <Button size="large" danger icon={<MinusOutlined />} onClick={confirmRemove}>
          Retirer de la watchlist
        </Button>
      ) : (
        <Button size="large" type="primary" icon={<PlusOutlined />} onClick={() => watchlist.add(symbol)}>
          Ajouter à la watchlist
        </Button>
      )}
      <p style={{ margin: 0, fontSize: 12, color: token.colorTextTertiary, textAlign: 'center', lineHeight: 1.4 }}>
        Indicateurs, pas des conseils financiers. La décision et le risque restent les vôtres.
      </p>
    </article>
  );
}
