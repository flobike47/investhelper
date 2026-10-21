import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Card, Collapse, Layout, Space, Spin, Tag, Typography, ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import { api } from '@/services/api';
import { SharedAudioPlayer } from '@/components/podcast/SharedAudioPlayer';
import { darkTheme, documentThemeFor } from '@/theme';
import { applyDocumentTheme } from '@/lib/documentTheme';

interface Episode {
  id: string;
  date: string;
  categories: string[];
  script: string;
  sources: string[];
  durationEstimateSec: number;
  createdAt: string;
  ttsChunkCount: number;
}

export default function SharedPodcast() {
  const { token } = useParams<{ token: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Page publique volontairement toujours en sombre : barre d'état mobile et
  // fond du document aussi, quel que soit le thème mémorisé sur l'appareil.
  useEffect(() => applyDocumentTheme(documentThemeFor('dark')), []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getSharedEpisode(token)
      .then((ep) => {
        // Normalise pour ne jamais avoir d'undefined sur les arrays
        setEpisode({
          ...ep,
          categories: Array.isArray(ep?.categories) ? ep.categories : [],
          sources: Array.isArray(ep?.sources) ? ep.sources : [],
          script: ep?.script ?? '',
          durationEstimateSec: ep?.durationEstimateSec ?? 0,
          ttsChunkCount: ep?.ttsChunkCount ?? 0,
        });
      })
      .catch((e: Error) => setError(e.message || 'Lien invalide'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <ConfigProvider theme={darkTheme}>
      {/* Layout antd : fond = token du thème sombre, sans couleur en dur. */}
      <Layout
        style={{
          minHeight: '100dvh',
          paddingTop: 'calc(40px + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'calc(16px + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(16px + env(safe-area-inset-right, 0px))',
        }}
      >
        <div style={{ width: '100%', maxWidth: 800, margin: '0 auto' }}>
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
                  <SharedAudioPlayer
                    script={episode.script}
                    token={token!}
                    ttsChunkCount={episode.ttsChunkCount}
                  />
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
      </Layout>
    </ConfigProvider>
  );
}
