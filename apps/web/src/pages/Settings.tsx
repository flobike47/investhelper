import { useEffect } from 'react';
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Card,
  Form,
  Popconfirm,
  Radio,
  Segmented,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useQuotas } from '@/hooks/useQuotas';
import { HORIZON_LIST } from '@/constants/horizons';
import type { PodcastDuration, UserSettings } from '@/services/api';

type FormValues = Pick<UserSettings, 'horizon' | 'theme' | 'podcastDuration'>;
const FIELDS = ['horizon', 'theme', 'podcastDuration'] as const;

export default function Settings() {
  const { user, signOut } = useAuth();
  const settings = useUserSettings();
  const quotas = useQuotas();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();

  const { horizon, theme, podcastDuration, loading } = settings;

  // Les réglages serveur peuvent changer après le montage du formulaire
  // (refetch, autre onglet) : on reflète la nouvelle valeur dans les champs
  // que l'utilisateur n'a pas touchés, sans écraser une saisie en cours.
  useEffect(() => {
    if (loading) return;
    const server: FormValues = { horizon, theme, podcastDuration };
    for (const f of FIELDS) {
      if (!form.isFieldTouched(f)) form.setFieldValue(f, server[f]);
    }
  }, [form, loading, horizon, theme, podcastDuration]);

  const onSave = async (values: FormValues) => {
    // N'envoyer que ce que l'utilisateur a réellement modifié : un champ
    // resté à sa valeur affichée ne doit jamais écraser la valeur serveur.
    const changed = (f: (typeof FIELDS)[number]) =>
      form.isFieldTouched(f) && values[f] !== settings[f];
    const patch: Partial<UserSettings> = {};
    if (changed('horizon')) patch.horizon = values.horizon;
    if (changed('theme')) patch.theme = values.theme;
    if (changed('podcastDuration')) patch.podcastDuration = values.podcastDuration;

    if (Object.keys(patch).length === 0) {
      message.info('Aucune modification à enregistrer.');
      return;
    }
    try {
      await settings.save(patch);
      form.setFields(FIELDS.map((name) => ({ name, touched: false })));
      message.success('Préférences enregistrées.');
    } catch (e) {
      message.error((e as Error).message || "Échec de l'enregistrement.");
    }
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

      <Card title="Préférences">
        {settings.error && (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            message="Impossible de charger tes réglages"
            description={`${settings.error.message} — seuls les champs que tu modifies seront enregistrés.`}
          />
        )}
        {loading ? (
          // Formulaire monté seulement une fois les réglages connus : ses
          // valeurs initiales sont alors celles du serveur, pas les défauts.
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <Form<FormValues>
            form={form}
            layout="vertical"
            initialValues={{ horizon, theme, podcastDuration }}
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
              <Button type="primary" htmlType="submit" loading={settings.saving}>
                Enregistrer
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>

      <Card title="Quotas du jour" loading={quotas.isLoading}>
        {quotas.error ? (
          <Alert type="error" showIcon message="Quotas indisponibles" description={quotas.error.message} />
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {(quotas.data ?? []).map((q) => (
              <div key={q.bucket} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Typography.Text>{labelFor(q.bucket)}</Typography.Text>
                <Typography.Text type="secondary" className="tabular-nums">
                  {q.used} / {q.limit} utilisés · reset dans {Math.ceil(q.resetSec / 3600)} h
                </Typography.Text>
              </div>
            ))}
          </Space>
        )}
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
