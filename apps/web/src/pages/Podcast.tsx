import { useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Collapse,
  Empty,
  Input,
  List,
  Popconfirm,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  CaretRightOutlined,
  CloseOutlined,
  DeleteOutlined,
  PlusOutlined,
  SoundOutlined,
  UpOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePodcastCategories, usePodcastEpisodes, usePodcastScript } from '@/hooks/usePodcast';
import { useUserSettings } from '@/hooks/useUserSettings';
import type { PodcastDuration } from '@/services/api';
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

const DURATION_OPTIONS: { label: string; value: PodcastDuration }[] = [
  { label: 'Auto', value: 'auto' },
  { label: '2 min', value: '2' },
  { label: '4 min', value: '4' },
  { label: '8 min', value: '8' },
];

/** Même limite que le BFF (validateString(name, 60)). */
const CATEGORY_MAX_LENGTH = 60;

function formatDuration(sec: number): string {
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest > 0 ? `${min} min ${rest} s` : `${min} min`;
}

export default function Podcast() {
  const cats = usePodcastCategories();
  const eps = usePodcastEpisodes();
  const scriptMut = usePodcastScript();
  const settings = useUserSettings();
  const { message } = AntApp.useApp();
  const { categories } = cats;

  const [newCat, setNewCat] = useState('');
  const [generating, setGenerating] = useState(false);
  // Choix explicite sur cette page ; tant qu'il est nul, la durée suit le
  // réglage utilisateur (y compris s'il arrive ou change après le montage).
  const [durationOverride, setDurationOverride] = useState<PodcastDuration | null>(null);
  const duration = durationOverride ?? settings.podcastDuration;
  // Un seul lecteur monté à la fois : speechSynthesis est global au navigateur
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);

  const addCategory = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      message.info(`« ${name} » est déjà suivie.`);
      return;
    }
    setNewCat('');
    // Succès annoncé une fois confirmé par le serveur ; en cas d'échec, le hook
    // annule l'ajout optimiste et affiche l'erreur — on rend alors la saisie.
    cats.addAsync(name).then(
      () => message.success(`« ${name} » ajoutée.`),
      () => setNewCat((cur) => cur || name),
    );
  };

  const onGenerate = async () => {
    if (categories.length === 0) {
      message.warning('Ajoute au moins une catégorie avant de générer.');
      return;
    }
    setGenerating(true);
    try {
      const target: number | 'auto' = duration === 'auto' ? 'auto' : Number(duration);
      const result = await scriptMut.mutateAsync({ categories: [...categories], target });
      const saved = await eps.add({
        date: dayjs().format('YYYY-MM-DD'),
        categories: [...categories],
        script: result.script,
        sources: result.sources,
        durationEstimateSec: result.durationEstimateSec,
      });
      setActiveEpisodeId(saved.id);
      message.success('Épisode généré.');
    } catch (e) {
      message.error((e as Error).message || 'Échec de la génération.');
    } finally {
      setGenerating(false);
    }
  };

  const renderCategories = () => {
    if (cats.loading) {
      return <Skeleton active title={false} paragraph={{ rows: 1, width: '60%' }} />;
    }
    if (cats.error) {
      return (
        <Alert
          type="error"
          showIcon
          message="Impossible de charger tes catégories"
          description={cats.error.message}
        />
      );
    }
    if (categories.length === 0) {
      return <Typography.Text type="secondary">Aucune catégorie pour l'instant.</Typography.Text>;
    }
    return (
      <Space wrap>
        {categories.map((c) => (
          <Tag key={c} style={{ padding: '2px 4px 2px 10px', fontSize: 13, marginInlineEnd: 0 }}>
            {c}
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              aria-label={`Retirer la catégorie ${c}`}
              onClick={() => cats.remove(c)}
              style={{ marginInlineStart: 2 }}
            />
          </Tag>
        ))}
      </Space>
    );
  };

  const renderEpisodes = () => {
    if (eps.loading) return <Skeleton active paragraph={{ rows: 4 }} />;
    if (eps.error) {
      return (
        <Alert
          type="error"
          showIcon
          message="Impossible de charger tes épisodes"
          description={eps.error.message}
        />
      );
    }
    if (eps.episodes.length === 0) {
      return <Empty description="Pas encore d'épisode. Clique sur Générer." />;
    }
    return (
      <List
        dataSource={eps.episodes}
        rowKey="id"
        renderItem={(ep) => {
          const when = dayjs(ep.createdAt).format('DD MMM YYYY · HH:mm');
          const active = ep.id === activeEpisodeId;
          return (
            <List.Item style={{ display: 'block', padding: '16px 0' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                <Space direction="vertical" size={2}>
                  <Typography.Text strong>{when}</Typography.Text>
                  <Space wrap size={4}>
                    {ep.categories.map((c) => (
                      <Tag key={c} color="blue">
                        {c}
                      </Tag>
                    ))}
                  </Space>
                  <Typography.Text type="secondary" className="tabular-nums" style={{ fontSize: 12 }}>
                    ≈ {formatDuration(ep.durationEstimateSec)} · {ep.sources.length} sources
                  </Typography.Text>
                </Space>
                <Space>
                  <Button
                    type={active ? 'default' : 'primary'}
                    icon={active ? <UpOutlined /> : <CaretRightOutlined />}
                    aria-expanded={active}
                    aria-controls={`player-${ep.id}`}
                    aria-label={active ? `Fermer le lecteur de l'épisode du ${when}` : `Écouter l'épisode du ${when}`}
                    onClick={() => setActiveEpisodeId(active ? null : ep.id)}
                  >
                    {active ? 'Fermer le lecteur' : 'Écouter'}
                  </Button>
                  <ShareEpisode episodeId={ep.id} label={`Partager l'épisode du ${when}`} />
                  <Popconfirm title="Supprimer cet épisode ?" onConfirm={() => eps.remove(ep.id)}>
                    <Button
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      aria-label={`Supprimer l'épisode du ${when}`}
                    />
                  </Popconfirm>
                </Space>
              </Space>
              {active && (
                <section
                  id={`player-${ep.id}`}
                  aria-label={`Lecteur de l'épisode du ${when}`}
                  style={{ marginTop: 12 }}
                >
                  {/* key : un nouvel épisode repart d'un lecteur vierge */}
                  <AudioPlayer key={ep.id} script={ep.script} />
                </section>
              )}
              <Collapse
                style={{ marginTop: 12 }}
                items={[
                  {
                    key: 'transcript',
                    label: 'Transcription complète',
                    children: (
                      <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
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
          );
        }}
      />
    );
  };

  const suggestions = SUGGESTIONS.filter(
    (s) => !categories.some((c) => c.toLowerCase() === s.toLowerCase()),
  );

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Podcast quotidien
        </Typography.Title>
        <Typography.Text type="secondary">
          Génère à la demande un brief audio à partir des news du jour sur les catégories de ton
          choix. Script écrit par Gemini, lu par la synthèse vocale du navigateur.
        </Typography.Text>
      </div>

      <Card title="Catégories suivies">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {renderCategories()}
          <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
            <Input
              aria-label="Nouvelle catégorie"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="ex: Inflation, Banques, IA générative..."
              onPressEnter={() => addCategory(newCat)}
              maxLength={CATEGORY_MAX_LENGTH}
              enterKeyHint="done"
              allowClear
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={cats.adding}
              onClick={() => addCategory(newCat)}
            >
              Ajouter
            </Button>
          </Space.Compact>
          {!cats.loading && suggestions.length > 0 && (
            <Space wrap size={[6, 6]}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Suggestions :
              </Typography.Text>
              {suggestions.map((s) => (
                <Button
                  key={s}
                  size="small"
                  type="dashed"
                  icon={<PlusOutlined />}
                  aria-label={`Ajouter la catégorie ${s}`}
                  onClick={() => addCategory(s)}
                >
                  {s}
                </Button>
              ))}
            </Space>
          )}
        </Space>
      </Card>

      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <div>
              <Typography.Text strong>Générer l'épisode du jour</Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {duration === 'auto'
                  ? 'Durée auto : adaptée au volume de news.'
                  : `~${duration} minutes.`}{' '}
                Utilise les news des dernières 24h.
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
          <Segmented<PodcastDuration>
            aria-label="Durée de l'épisode"
            value={duration}
            onChange={(v) => setDurationOverride(v)}
            options={DURATION_OPTIONS}
          />
        </Space>
        {generating && (
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            message="Génération en cours — Gemini écrit le script à partir des news. Environ 15-30 secondes."
          />
        )}
      </Card>

      <Card
        title={
          eps.loading ? (
            'Épisodes'
          ) : (
            <span className="tabular-nums">{`Épisodes (${eps.episodes.length})`}</span>
          )
        }
      >
        {renderEpisodes()}
      </Card>
    </Space>
  );
}
