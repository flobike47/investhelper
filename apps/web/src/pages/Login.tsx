import { Button, Card, Space, Typography, message } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const onClick = async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'radial-gradient(ellipse at top, #131720 0%, #0b0d12 50%)',
        padding: 16,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space align="center">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #22c55e, #3b82f6)',
                display: 'grid',
                placeItems: 'center',
                color: '#0b0d12',
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              ih
            </div>
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                InvestHelper
              </Typography.Title>
              <Typography.Text type="secondary">
                Aide à l'investissement actions & ETF
              </Typography.Text>
            </div>
          </Space>

          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Connecte-toi pour synchroniser ta watchlist, tes catégories de podcast et
            tes préférences sur tous tes appareils.
          </Typography.Paragraph>

          <Button
            type="primary"
            size="large"
            icon={<GoogleOutlined />}
            block
            onClick={onClick}
          >
            Se connecter avec Google
          </Button>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            En te connectant tu acceptes que tes préférences soient stockées dans
            Supabase. Aucune donnée bancaire, jamais.
          </Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
