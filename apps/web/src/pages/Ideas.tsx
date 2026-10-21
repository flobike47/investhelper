import { useState } from 'react';
import { Alert, Button, Empty, Segmented, Skeleton, theme } from 'antd';
import { useLocation } from 'react-router-dom';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useThematicPicks } from '@/hooks/useThematicPicks';
import { HORIZON_LIST, type Horizon } from '@/constants/horizons';
import { describeError } from '@/lib/watchlistSummary';
import { PageHeader } from '@/components/common/PageHeader';
import { MasterDetail } from '@/components/layout/MasterDetail';
import { AssetRow } from '@/components/stocks/AssetRow';

const DIRECTION = {
  bullish: { arrow: '↑', label: 'haussier' },
  bearish: { arrow: '↓', label: 'baissier' },
  neutral: { arrow: '→', label: 'neutre' },
} as const;

/**
 * Idées du moment : thèmes dominants de l'actualité (analyse IA) croisés avec
 * le consensus analystes et les signaux techniques. Des pistes, pas des conseils.
 */
export default function Ideas() {
  const { token } = theme.useToken();
  const { pathname } = useLocation();
  const { horizon, setHorizon } = useUserSettings();
  const { themes, themesLoading, themesError, picks, picksLoading, picksErrors } = useThematicPicks(horizon, 5);
  const [openTheme, setOpenTheme] = useState<string | null>(null);
  const selected = decodeURIComponent(pathname.match(/^\/ideas\/asset\/([^/]+)/)?.[1] ?? '').toUpperCase();
  const card = { background: token.colorBgContainer, borderRadius: 16, border: `1px solid ${token.colorBorderSecondary}` };
  const shownTheme = themes?.find((t) => t.name === openTheme);
  const dirColor = (d: keyof typeof DIRECTION) =>
    d === 'bullish' ? token.colorSuccessText : d === 'bearish' ? token.colorErrorText : token.colorTextSecondary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader eyebrow="Actualité × analystes × technique" title="Idées du moment" />
      <MasterDetail placeholder="Sélectionne une idée pour afficher sa fiche.">
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: token.colorTextSecondary }}>
          Cinq titres où les thèmes de l'actualité, le consensus des analystes et les indicateurs techniques vont dans le
          même sens. Des pistes à étudier, pas des conseils financiers : la décision et le risque restent les vôtres.
        </p>

        <Segmented<Horizon>
          block
          aria-label="Horizon d'investissement"
          value={horizon}
          onChange={setHorizon}
          options={HORIZON_LIST.map((h) => ({ label: h.label, value: h.id }))}
        />

        <section aria-labelledby="themes-title" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 id="themes-title" style={{ margin: '0 4px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Thèmes dans l'actualité
          </h2>
          {themesLoading && <Skeleton.Input active block />}
          {themesError && (
            <Alert type="error" showIcon message="Analyse des thèmes indisponible" description={describeError(themesError)} />
          )}
          {themes && themes.length > 0 && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {themes.map((t) => {
                  const d = DIRECTION[t.direction];
                  const open = openTheme === t.name;
                  return (
                    <Button
                      key={t.name}
                      shape="round"
                      aria-pressed={open}
                      aria-label={`${t.name}, tendance ${d.label}`}
                      onClick={() => setOpenTheme(open ? null : t.name)}
                      style={{ height: 40, fontWeight: 600, borderColor: open ? token.colorPrimary : undefined }}
                    >
                      <span aria-hidden style={{ color: dirColor(t.direction), fontWeight: 800 }}>
                        {d.arrow}
                      </span>
                      {t.name}
                    </Button>
                  );
                })}
              </div>
              {shownTheme && (
                <p style={{ ...card, margin: 0, padding: 14, fontSize: 14, lineHeight: 1.45 }}>{shownTheme.summary}</p>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="picks-title" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 id="picks-title" style={{ margin: '0 4px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Sélection
          </h2>
          {picksLoading && <Skeleton active paragraph={{ rows: 5 }} />}
          {!picksLoading && picks.length === 0 && picksErrors.length === 0 && !themesError && (
            <div style={{ ...card, padding: 24 }}>
              <Empty description="Aucune idée calculable pour l'instant." />
            </div>
          )}
          {picks.length > 0 && (
            <ol aria-label="Idées classées" style={{ ...card, margin: 0, padding: 0, listStyle: 'none', overflow: 'hidden' }}>
              {picks.map((p, i) => (
                <li key={p.ticker.symbol} style={{ borderTop: i === 0 ? undefined : `1px solid ${token.colorBorderSecondary}` }}>
                  <AssetRow
                    data={p.ticker}
                    horizon={horizon}
                    to={`/ideas/asset/${encodeURIComponent(p.ticker.symbol)}`}
                    selected={p.ticker.symbol === selected}
                    label={[`${i + 1}. ${p.entry.name}`, p.themes[0]].filter(Boolean).join(' · ')}
                  />
                </li>
              ))}
            </ol>
          )}
          {!picksLoading && picksErrors.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`${picksErrors.length} candidat(s) non analysé(s)`}
              description={picksErrors
                .slice(0, 3)
                .map((e) => `${e.symbol} : ${describeError(e.error)}`)
                .join(' · ')}
            />
          )}
        </section>
      </MasterDetail>
    </div>
  );
}
