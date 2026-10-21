import { Button, Result, Typography, theme } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useRouteError } from 'react-router-dom';
import { describeRouteError } from '@/lib/routeError';

/**
 * `errorElement` des routes : une exception de rendu (graphique, donnée
 * inattendue) ou un chunk introuvable après déploiement affiche ce message
 * au lieu d'une page blanche.
 *
 * `fullPage` : sur les routes racines il n'y a plus de layout autour, on
 * centre alors le message dans tout l'écran.
 */
export function RouteError({ fullPage = false }: { fullPage?: boolean }) {
  const error = useRouteError();
  const navigate = useNavigate();
  const view = describeRouteError(error);
  const { token } = theme.useToken();

  return (
    <div
      role="alert"
      style={
        fullPage
          ? {
              minHeight: '100dvh',
              display: 'grid',
              placeItems: 'center',
              padding: 16,
              background: token.colorBgLayout,
            }
          : { padding: '24px 0' }
      }
    >
      <Result
        status={view.status}
        title={view.title}
        subTitle={view.subTitle}
        extra={[
          <Button
            key="reload"
            type="primary"
            icon={<ReloadOutlined />}
            onClick={() => window.location.reload()}
          >
            Recharger
          </Button>,
          <Button key="home" onClick={() => navigate('/')}>
            Retour au tableau de bord
          </Button>,
        ]}
      >
        {(view.detail || view.reqId) && (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            {view.detail && <span style={{ display: 'block' }}>{view.detail}</span>}
            {view.reqId && (
              <span>
                Référence : <Typography.Text code copyable>{view.reqId}</Typography.Text>
              </span>
            )}
          </Typography.Paragraph>
        )}
      </Result>
    </div>
  );
}
