import { Avatar, Button, Card, Form, Popconfirm, Radio, Segmented, Space, Typography, message } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { useUserSettings } from '@/hooks/useUserSettings';
import { HORIZON_LIST, type Horizon } from '@/constants/horizons';
import type { PodcastDuration } from '@/services/api';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export default function Settings() {
  const { user, signOut } = useAuth();
  const settings = useUserSettings();
  const [form] = Form.useForm();

  const quotas = useQuery({
    queryKey: ['quotas'],
    queryFn: () => api.getQuotas().then((r) => r.quotas),
    staleTime: 30_000,
  });

  const onSave = (values: {
    horizon: Horizon;
    theme: 'dark' | 'light';
    podcastDuration: PodcastDuration;
  }) => {
    if (values.horizon !== settings.horizon) settings.setHorizon(values.horizon);
    if (values.theme !== settings.theme) settings.setTheme(values.theme);
    if (values.podcastDuration !== settings.podcastDuration) {
      settings.setPodcastDuration(values.podcastDuration);
    }
    message.success('Préférences enregistrées.');
  };

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 720 }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        Réglages
      </Typography.Title>

      <Card title="Mon compte">
        <Space align="center" size={16} style={{ width: '100%' }}>
          <Avatar size={56} src={avatarUrl} icon={<UserOutlined />} />
          <div style={{ flex: 1 }}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {fullName}
            </Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user?.email}
            </Typography.Text>
          </div>
          <Popconfirm title="Se déconnecter ?" onConfirm={() => signOut()}>
            <Button danger icon={<LogoutOutlined />}>
              Déconnexion
            </Button>
          </Popconfirm>
        </Space>
      </Card>

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            horizon: settings.horizon,
            theme: settings.theme,
            podcastDuration: settings.podcastDuration,
          }}
          onFinish={onSave}
        >
          <Form.Item label="Horizon d'investissement par défaut" name="horizon">
            <Radio.Group>
              {HORIZON_LIST.map((h) => (
                <Radio.Button key={h.id} value={h.id}>
                  {h.label}
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="Durée des podcasts"
            name="podcastDuration"
            extra="Auto : la durée s'adapte au volume d'actualités du jour pour les catégories choisies."
          >
            <Segmented<PodcastDuration>
              options={[
                { label: 'Auto', value: 'auto' },
                { label: '2 min', value: '2' },
                { label: '4 min', value: '4' },
                { label: '8 min', value: '8' },
              ]}
            />
          </Form.Item>

          <Form.Item label="Thème" name="theme">
            <Radio.Group>
              <Radio.Button value="dark">Sombre</Radio.Button>
              <Radio.Button value="light">Clair</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              Enregistrer
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="Quotas du jour" loading={quotas.isLoading}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {(quotas.data ?? []).map((q) => (
            <div key={q.bucket} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography.Text>{labelFor(q.bucket)}</Typography.Text>
              <Typography.Text type="secondary">
                {q.used} / {q.limit} utilisés · reset dans {Math.ceil(q.resetSec / 3600)} h
              </Typography.Text>
            </div>
          ))}
        </Space>
      </Card>
    </Space>
  );
}

function labelFor(b: string): string {
  switch (b) {
    case 'sentiment': return 'Analyses sentiment news';
    case 'themes': return 'Extractions de thèmes';
    case 'podcastScript': return 'Scripts podcast générés';
    case 'podcastTts': return 'Chunks TTS synthétisés';
    default: return b;
  }
}
