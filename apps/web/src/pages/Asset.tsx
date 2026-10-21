import { Drawer, theme } from 'antd';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/useIsMobile';
import { AssetDetail } from '@/components/stocks/AssetDetail';

/** Même règle que le BFF (validateSymbol) : un lien forgé ne déclenche aucune requête. */
const SYMBOL_RE = /^[A-Z0-9.-]{1,20}$/;

/**
 * Route `…/asset/:symbol`, enfant de la Watchlist et des Idées : panneau
 * qui monte du bas sur mobile (la liste reste visible derrière), colonne de
 * droite sur PC (rendue par MasterDetail). Fermer = revenir à la liste, donc
 * le bouton retour du navigateur ferme aussi la fiche.
 */
export default function AssetRoute() {
  const { symbol: raw = '' } = useParams();
  const symbol = raw.toUpperCase();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { token } = theme.useToken();

  if (!SYMBOL_RE.test(symbol)) return <Navigate to=".." replace />;
  const close = () => navigate('..');

  if (!isMobile) return <AssetDetail key={symbol} symbol={symbol} onClose={close} />;

  return (
    <Drawer
      open
      placement="bottom"
      onClose={close}
      closable={false}
      height="calc(100dvh - env(safe-area-inset-top, 0px) - 12px)"
      styles={{
        content: { borderRadius: '20px 20px 0 0', background: token.colorBgElevated },
        body: { padding: '0 20px calc(24px + env(safe-area-inset-bottom, 0px))' },
      }}
      aria-label={`Fiche ${symbol}`}
    >
      <div aria-hidden style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 12px' }}>
        <span style={{ width: 36, height: 5, borderRadius: 3, background: token.colorFill }} />
      </div>
      <AssetDetail key={symbol} symbol={symbol} onClose={close} />
    </Drawer>
  );
}
