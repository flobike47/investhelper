import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/useIsMobile';
import { AssetDetail } from '@/components/stocks/AssetDetail';
import { BottomSheet } from '@/components/common/BottomSheet';

/** Même règle que le BFF (validateSymbol) : un lien forgé ne déclenche aucune requête. */
const SYMBOL_RE = /^[A-Z0-9.-]{1,20}$/;

/**
 * Route `…/asset/:symbol`, enfant de la Watchlist et des Idées : panneau
 * qui monte du bas sur mobile (la liste reste visible derrière), colonne de
 * droite sur PC (rendue par MasterDetail). Fermer (croix, glisser vers le
 * bas) = revenir à la liste, donc le bouton retour du navigateur ferme aussi
 * la fiche.
 */
export default function AssetRoute() {
  const { symbol: raw = '' } = useParams();
  const symbol = raw.toUpperCase();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  if (!SYMBOL_RE.test(symbol)) return <Navigate to=".." replace />;
  const close = () => navigate('..');

  if (!isMobile) return <AssetDetail key={symbol} symbol={symbol} onClose={close} />;

  return (
    <BottomSheet open onClose={close} closable={false} aria-label={`Fiche ${symbol}`}>
      <AssetDetail key={symbol} symbol={symbol} onClose={close} />
    </BottomSheet>
  );
}
