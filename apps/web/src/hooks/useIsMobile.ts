import { Grid } from 'antd';

/**
 * Mise en page mobile (barre d'onglets, fiche en panneau) sous le point de
 * rupture `md` (768 px) ; PC au-delà (barre latérale, fiche en colonne).
 */
export function useIsMobile(): boolean {
  const screens = Grid.useBreakpoint();
  return !screens.md;
}
