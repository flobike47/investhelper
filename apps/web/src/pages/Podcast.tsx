import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Input,
  List,
  message,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd';
import { CloseOutlined, DeleteOutlined, PlusOutlined, SoundOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePodcastCategories, usePodcastEpisodes } from '@/hooks/usePodcast';
import { api } from '@/services/api';
import { AudioPlayer } from '@/components/podcast/AudioPlayer';
import { ShareEpisode } from '@/components/podcast/ShareEpisode';

const SUGGESTIONS = [
  'Macro / banques centrales',
  'Tech & IA',
  'Marchés actions',
  'Géopolitique',
  'Énergie',
  'Crypto',
  'Luxe',
  'Défense',
  'Semi-conducteurs',
];

export default function Podcast() {
  const { categories, add: addCategory, remove: removeCategory } = usePodcastCategories();
  const { episodes, add: addEpisode, remove: deleteEpisode } = usePodcastEpisodes();

  const [newCat, setNewCat] = useState('');
  const [generating, setGenerating] = useState(false);

  const onGenerate = async () => {
    if (categories.length === 0) {
      message.warning('Ajoute au moins une catégorie avant de générer.');
      return;
    }
    setGenerating(true);
    try {
      const result = await api.podcastScript(categories, 4);
      await addEpisode({
        date: dayjs().format('YYYY-MM-DD'),
        categories: [...categories],
        script: result.script,
        sources: result.sources,
        durationEstimateSec: result.durationEstimateSec,
      });
      message.success('Épisode généré.');
    } catch (e) {
      message.error((e as Error).message || 'Échec de la génération.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Podcast quotidien
          </Typography.Title>
          <Typography.Text type="secondary">
            Génère à la demande un brief audio à partir des news du jour sur les catégories de
            ton choix. Script écrit par Gemini, lu par la synthèse vocale du navigateur.
          </Typography.Text>
        </div>

        <Card title="Catégories suivies">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              {categories.length === 0 && (
                <Typography.Text type="secondary">Aucune catégorie pour l'instant.</Typography.Text>
              )}
              {categories.map((c) => (
                <Tag
                  key={c}
                  closable
                  onClose={() => removeCategory(c)}
                  closeIcon={<CloseOutlined />}
                  style={{ padding: '4px 10px', fontSize: 13 }}
                >
                  {c}
                </Tag>
              ))}
            </Space>
            <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="ex: Inflation, Banques, IA générative..."
                onPressEnter={() => {
                  addCategory(newCat);
                  setNewCat('');
                }}
                allowClear
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  addCategory(newCat);
                  setNewCat('');
                }}
              >
                Ajouter
              </Button>
            </Space.Compact>
            <Space wrap>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Suggestions :
              </Typography.Text>
              {SUGGESTIONS.filter((s) => !categories.includes(s)).map((s) => (
                <Tag
                  key={s}
                  style={{ cursor: 'pointer' }}
                  onClick={() => addCategory(s)}
                >
                  + {s}
                </Tag>
              ))}
            </Space>
          </Space>
        </Card>

        <Card>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <div>
              <Typography.Text strong>Générer l'épisode du jour</Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                ~4 minutes. Utilise les news des dernières 24h pour les catégories ci-dessus.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<SoundOutlined />}
              loading={generating}
              onClick={onGenerate}
              disabled={categories.length === 0}
            >
              Générer
            </Button>
          </Space>
          {generating && (
            <Alert
              style={{ marginTop: 16 }}
              type="info"
              message="Génération en cours — Gemini écrit le script à partir des news. Environ 15-30 secondes."
            />
          )}
        </Card>

        <Card title={`Épisodes (${episodes.length})`}>
          {episodes.length === 0 ? (
            <Empty description="Pas encore d'épisode. Clique sur Générer." />
          ) : (
            <List
              dataSource={episodes}
              renderItem={(ep) => (
                <List.Item style={{ display: 'block', padding: '16px 0' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>
                        {dayjs(ep.createdAt).format('DD MMM YYYY · HH:mm')}
                      </Typography.Text>
                      <Space wrap size={4}>
                        {ep.categories.map((c) => (
                          <Tag key={c} color="blue">
                            {c}
                          </Tag>
                        ))}
                      </Space>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        ≈ {Math.floor(ep.durationEstimateSec / 60)} min{' '}
                        {ep.durationEstimateSec % 60 > 0
                          ? `${ep.durationEstimateSec % 60} s`
                          : ''}{' '}
                        · {ep.sources.length} sources
                      </Typography.Text>
                    </Space>
                    <Space>
                      <ShareEpisode episodeId={ep.id} />
                      <Popconfirm
                        title="Supprimer cet épisode ?"
                        onConfirm={() => deleteEpisode(ep.id)}
                      >
                        <Button danger type="text" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </Space>
                  <div style={{ marginTop: 12 }}>
                    <AudioPlayer script={ep.script} />
                  </div>
                  <Collapse
                    style={{ marginTop: 12 }}
                    items={[
                      {
                        key: 'transcript',
                        label: 'Transcription complète',
                        children: (
                          <Typography.Paragraph
                            style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}
                          >
                            {ep.script}
                          </Typography.Paragraph>
                        ),
                      },
                      {
                        key: 'sources',
                        label: `Sources (${ep.sources.length})`,
                        children: (
                          <Space direction="vertical" size={4}>
                            {ep.sources.map((s) => (
                              <a key={s} href={s} target="_blank" rel="noreferrer">
                                {s}
                              </a>
                            ))}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      </Space>
    
  );
}
