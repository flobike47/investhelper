import { Spin, theme } from 'antd';

/**
 * Indicateur de chargement plein écran : session en cours de lecture ou
 * premier chargement d'une route lazy (avant que le layout n'existe).
 */
export function PageLoader() {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100dvh',
        background: token.colorBgLayout,
      }}
    >
      <Spin size="large" aria-label="Chargement" />
    </div>
  );
}
