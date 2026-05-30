import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Card, Collapse, Space, Spin, Tag, Typography, ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import { api } from '@/services/api';
import { SharedAudioPlayer } from '@/components/podcast/SharedAudioPlayer';
import { darkTheme } from '@/theme';

interface Episode {
  id: string;
  date: string;
  categories: string[];
  script: string;
  sources: string[];
  durationEstimateSec: number;
  createdAt: string;
}

export default function SharedPodcast() {
  const { token } = useParams<{ token: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getSharedEpisode(token)
      .then((ep) => {
        // eslint-disable-next-line no-console
        console.log('[shared-podcast] response from BFF:', ep);
        // Normalise pour ne jamais avoir d'undefined sur les arrays
        setEpisode({
          ...ep,
          categories: Array.isArray(ep?.categories) ? ep.categories : [],
          sources: Array.isArray(ep?.sources) ? ep.sources : [],
          script: ep?.script ?? '',
          durationEstimateSec: ep?.durationEstimateSec ?? 0,
        });
      })
      .catch((e: Error) => setError(e.message || 'Lien invalide'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <ConfigProvider theme={darkTheme}>
      <div
        style={{
          minHeight: '100vh',
          background: '#0b0d12',
          padding: '40px 16px',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <Typography.Title level={2} style={{ margin: 0 }}>
                🎙️ Podcast InvestHelper
              </Typography.Title>
              <Typography.Text type="secondary">
                Brief économique partagé
              </Typography.Text>
            </div>

            {loading && (
              <Card>
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <Spin size="large" />
                </div>
              </Card>
            )}

            {error && (
              <Alert
                type="error"
                showIcon
                message="Lien indisponible"
                description={error}
              />
            )}

            {episode && (
              <>
                <Card>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      Épisode du {dayjs(episode.createdAt).format('DD MMMM YYYY')}
                    </Typography.Title>
                    <Space wrap>
                      {episode.categories.map((c) => (
                        <Tag key={c} color="blue">
                          {c}
                        </Tag>
                      ))}
                    </Space>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      ≈ {Math.floor(episode.durationEstimateSec / 60)} min{' '}
                      {episode.durationEstimateSec % 60 > 0
                        ? `${episode.durationEstimateSec % 60} s`
                        : ''}{' '}
                      · {episode.sources.length} sources
                    </Typography.Text>
                  </Space>
                </Card>

                <Card title="Écouter">
                  <SharedAudioPlayer script={episode.script} token={token!} />
                </Card>

                <Card>
                  <Collapse
                    items={[
                      {
                        key: 'transcript',
                        label: 'Transcription complète',
                        children: (
                          <Typography.Paragraph
                            style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}
                          >
                            {episode.script}
                          </Typography.Paragraph>
                        ),
                      },
                      {
                        key: 'sources',
                        label: `Sources (${episode.sources.length})`,
                        children: (
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            {episode.sources.map((s) => (
                              <a key={s} href={s} target="_blank" rel="noreferrer">
                                {s}
                              </a>
                            ))}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>

                <Typography.Text
                  type="secondary"
                  style={{ display: 'block', textAlign: 'center', fontSize: 12 }}
                >
                  Généré par InvestHelper. Aucune recommandation financière.
                </Typography.Text>
              </>
            )}
          </Space>
        </div>
      </div>
    </ConfigProvider>
  );
}
