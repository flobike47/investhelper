import type { ReactNode } from 'react';
import { App as AntApp, Alert, Button, Collapse, Skeleton, Tag, theme } from 'antd';
import { CloseOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useCompanyNews, useProfile } from '@/hooks/useStockData';
import { useSignal } from '@/hooks/useSignals';
import { useTickerSentiment } from '@/hooks/useNewsAnalysis';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useUserSettings } from '@/hooks/useUserSettings';
import { HORIZONS } from '@/constants/horizons';
import { findInUniverse } from '@/constants/universe';
import { formatEur, formatMoney, formatNative } from '@/lib/currency';
import { formatSignedPct } from '@/lib/format';
import { describeError } from '@/lib/watchlistSummary';
import { SignalTag } from '@/components/common/SignalTag';
import { ChangeIndicator } from './ChangeIndicator';
import { PriceSparkline } from './PriceSparkline';
import { SENTIMENT_COLORS, SENTIMENT_LABELS } from './sentiment';

const ratioFormatter = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatRatio = (r: number) => ratioFormatter.format(r);
const formatPct = (v: number) => `${String(v).replace('.', ',')}\u202f%`;

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
  // Tout est calculé par le BFF : la fiche ne fait qu'afficher.
  const detail = useSignal(symbol, horizon);
  const d = detail.data;
  const { data: news } = useCompanyNews(symbol, 14);
  const profile = useProfile(symbol);
  const sentiment = useTickerSentiment(symbol);
  const watchlist = useWatchlist();

  const name = findInUniverse(symbol)?.name ?? profile.data?.name;
  const currency = d?.currency ?? null;
  const inWatchlist = watchlist.tickers.includes(symbol);
  const analog = d?.analog ?? null;
  const levels = d?.levels;
  const playbook = d?.playbook;
  const earnings = d?.earnings ?? null;
  const fatalError =
    (detail.error as Error | null) ??
    (d && d.price.native === null && d.score === null && d.errors.length > 0 ? new Error(d.errors.join(' · ')) : null);

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
            {[name, currency && currency !== 'EUR' ? `coté en ${currency}` : null].filter(Boolean).join(' · ') || ' '}
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

      {fatalError && (
        <Alert type="error" showIcon message="Données indisponibles" description={describeError(fatalError)} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {detail.isLoading ? (
          <Skeleton.Input active size="large" style={{ width: 200 }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="tabular-nums" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.025em' }}>
              {formatMoney(d?.price, currency)}
            </span>
            <ChangeIndicator pct={d?.changePct ?? null} fontSize={15} />
            <span style={{ fontSize: 13, color: token.colorTextSecondary }}>aujourd'hui</span>
          </div>
        )}
        {currency && currency !== 'EUR' && d?.price.native != null && d.price.eur !== null && (
          <span className="tabular-nums" style={{ fontSize: 13, color: token.colorTextSecondary }}>
            soit {formatNative(d.price.native, currency)} · converti au taux du jour
          </span>
        )}
      </div>

      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <PriceSparkline series={d?.chart} height={160} />
        <figcaption style={{ fontSize: 12, color: token.colorTextTertiary }}>
          Historique utilisé pour l'horizon {cfg.label.toLowerCase()}
        </figcaption>
      </figure>

      <section aria-label="Signal" style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Signal · {cfg.label.toLowerCase()}
          </span>
          {d ? <SignalTag signal={d.signal} /> : <Skeleton.Button active size="small" />}
        </div>
        {d && d.score !== null && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: token.colorTextSecondary }}>
                <span>Baissier</span>
                <span className="tabular-nums" style={{ color: token.colorText, fontWeight: 650 }}>
                  Score {d.score > 0 ? '+' : ''}
                  {d.score}
                </span>
                <span>Haussier</span>
              </div>
              <div
                role="meter"
                aria-label="Score combiné"
                aria-valuemin={-100}
                aria-valuemax={100}
                aria-valuenow={d.score}
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
                    left: `${(d.score + 100) / 2}%`,
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
              {d.technical.rationale.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {d.analyst.totalAnalysts > 0 && (
                <li className="tabular-nums">
                  {(d.analyst.buyRatio * 100).toFixed(0)}&#8239;% des {d.analyst.totalAnalysts} analystes à l'achat
                  {d.analyst.targetMean.native !== null && `, objectif moyen ${formatMoney(d.analyst.targetMean, currency)}`}.
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="asset-plan" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SectionTitle>
            <span id="asset-plan">Plan conditionnel</span>
          </SectionTitle>
          <span style={{ fontSize: 13, color: token.colorTextSecondary }}>Détention typique : {playbook?.holdingPeriod ?? '—'}</span>
        </div>
        {earnings?.withinWindow && (
          <Alert
            type="warning"
            showIcon
            message={`Résultats ${
              earnings.daysUntil === 0 ? "aujourd'hui" : `le ${dayjs(earnings.date).format('D MMM')} (dans ${earnings.daysUntil} j)`
            } : volatilité accrue possible pendant la fenêtre du plan.`}
          />
        )}
        {d?.signal === 'sell' && (
          <p style={{ margin: 0, fontSize: 14, color: token.colorTextSecondary }}>
            Pas de zone d'entrée sur un signal baissier.
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Tile label="Zone d'entrée" value={formatMoney(levels?.entry, currency)} />
          {levels && !levels.stopApplies ? (
            <Tile label="Sortie" value="Sur thèse" />
          ) : (
            <Tile label="Stop technique" value={formatMoney(levels?.stop, currency)} />
          )}
          <Tile label="Objectif" value={formatMoney(levels?.target, currency)} />
        </div>
        {levels && levels.riskReward !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <span className="tabular-nums">Gain/risque 1 : {formatRatio(levels.riskReward)}</span>
            {levels.unfavorable && (
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                Défavorable
              </Tag>
            )}
          </div>
        )}
        {d && levels?.stopApplies && (d.signal === 'buy' || d.signal === 'hold') && (
          <p className="tabular-nums" style={{ margin: 0, fontSize: 14, lineHeight: 1.4, color: token.colorTextSecondary }}>
            {!d.capitalSet ? (
              <>
                Renseigner le capital dans les <Link to="/settings">réglages</Link> pour obtenir la taille de position.
              </>
            ) : d.sizing === null ? null : d.sizing.shares === 0 ? (
              `Un seul titre dépasserait le risque de ${formatPct(d.riskPerTradePct)} du capital.`
            ) : (
              `Pour risquer ${formatPct(d.riskPerTradePct)} du capital : ${d.sizing.shares} titre${d.sizing.shares > 1 ? 's' : ''} · ${formatEur(
                d.sizing.amountEur,
              )} · perte max ${formatEur(d.sizing.maxLossEur)} si le stop est touché${d.sizing.cappedByCapital ? ' (limité par le capital)' : ''}.`
            )}
          </p>
        )}
        {playbook && (
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
        )}
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
              {detail.isLoading
                ? '…'
                : earnings
                  ? `${dayjs(earnings.date).format('D MMM')} · ${
                      earnings.hour === 'bmo' ? 'avant ouverture' : earnings.hour === 'amc' ? 'après clôture' : 'horaire non précisé'
                    }`
                  : 'aucune date annoncée'}
            </span>
          </div>
          <div style={{ padding: '14px 16px', borderTop: divider, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Analogue historique</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {analog && analog.occurrences > 0 && !analog.significant && (
                  <Tag style={{ marginInlineEnd: 0 }}>Peu significatif</Tag>
                )}
                <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 650 }}>
                  {analog && analog.occurrences > 0 && analog.medianReturn !== null
                    ? `${formatSignedPct(analog.medianReturn * 100, 1)} médian`
                    : '—'}
                </span>
              </span>
            </div>
            <span className="tabular-nums" style={{ fontSize: 13, color: token.colorTextSecondary, lineHeight: 1.4 }}>
              {analog && analog.occurrences > 0
                ? `Sur ${analog.horizonBars} ${d?.barUnit ?? 'séance'}s après un RSI comparable · ${analog.occurrences} cas${
                    analog.positiveRatio !== null ? ` · ${(analog.positiveRatio * 100).toFixed(0)}\u202f% positifs` : ''
                  }${
                    analog.baselineMedian !== null
                      ? `, contre ${formatSignedPct(analog.baselineMedian * 100, 1)} habituellement sur la même durée`
                      : ''
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
