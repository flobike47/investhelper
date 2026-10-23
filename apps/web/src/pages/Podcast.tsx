import { useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Input,
  Segmented,
  Skeleton,
  theme,
} from 'antd';
import {
  BackwardOutlined,
  CaretRightFilled,
  CloseOutlined,
  ForwardOutlined,
  LoadingOutlined,
  MoreOutlined,
  PauseOutlined,
  PlusOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePodcastCategories, usePodcastEpisodes, usePodcastScript } from '@/hooks/usePodcast';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useIsMobile } from '@/hooks/useIsMobile';
import { episodeLabels, player, toPlayerEpisode, usePlayer } from '@/hooks/usePlayer';
import type { PodcastDuration, PodcastEpisodeDto } from '@/services/api';
import type { PlayerSource } from '@/lib/player';
import { PageHeader } from '@/components/common/PageHeader';
import { ShareEpisode } from '@/components/podcast/ShareEpisode';
import { BottomSheet } from '@/components/common/BottomSheet';

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

const SOURCE_OPTIONS: { label: string; value: PlayerSource }[] = [
  { label: "Voix de l'appareil", value: 'speech' },
  { label: 'Voix HD (Gemini)', value: 'hd' },
];

/** Même limite que le BFF (validateString(name, 60)). */
const CATEGORY_MAX_LENGTH = 60;

function formatDuration(sec: number): string {
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest > 0 ? `${min} min ${String(rest).padStart(2, '0')}` : `${min} min`;
}

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} style={{ margin: '0 4px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
      {children}
    </h2>
  );
}

/** Grand lecteur de l'épisode en cours (même état que le mini-lecteur). */
function NowPlaying() {
  const s = usePlayer();
  const { token } = theme.useToken();
  if (!s.episode) return null;
  const playing = s.status === 'playing';
  const loading = s.status === 'loading';
  const hd = s.source === 'hd';

  return (
    <section
      aria-labelledby="now-title"
      style={{
        borderRadius: 20,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        background: `linear-gradient(180deg, ${token.colorPrimaryBg} 0%, ${token.colorBgContainer} 75%)`,
        border: `1px solid ${token.colorPrimaryBorder}`,
      }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span
          aria-hidden
          style={{ width: 60, height: 60, borderRadius: 14, background: token.colorPrimary, color: '#0b0d12', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 22, flex: '0 0 auto' }}
        >
          ih
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 id="now-title" style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            {s.episode.title}
          </h2>
          <span style={{ fontSize: 13, color: token.colorTextSecondary }}>Alex &amp; Sophie · {s.episode.subtitle}</span>
        </div>
        <Button type="text" shape="circle" aria-label="Fermer le lecteur" icon={<CloseOutlined />} onClick={() => player.close()} style={{ width: 44, height: 44 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          role="progressbar"
          aria-label="Progression de la lecture"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(s.progress * 100)}
          style={{ height: 4, borderRadius: 2, background: token.colorFillSecondary, overflow: 'hidden' }}
        >
          <div style={{ height: 4, width: `${s.progress * 100}%`, background: token.colorPrimary }} />
        </div>
        <span className="tabular-nums" style={{ fontSize: 12, color: token.colorTextSecondary, minHeight: 18 }}>
          {loading ? s.loadingText : s.position}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <Button
          type="text"
          shape="circle"
          size="large"
          aria-label={hd ? 'Reculer de 15 secondes' : 'Passage précédent'}
          icon={<BackwardOutlined />}
          disabled={loading}
          onClick={() => player.skip(-1)}
          style={{ width: 48, height: 48, fontSize: 22 }}
        />
        <Button
          type="primary"
          shape="circle"
          aria-label={playing ? 'Pause' : 'Lecture'}
          disabled={loading}
          icon={loading ? <LoadingOutlined /> : playing ? <PauseOutlined /> : <CaretRightFilled />}
          onClick={() => player.toggle()}
          style={{ width: 64, height: 64, fontSize: 26 }}
        />
        <Button
          type="text"
          shape="circle"
          size="large"
          aria-label={hd ? 'Avancer de 15 secondes' : 'Passage suivant'}
          icon={<ForwardOutlined />}
          disabled={loading}
          onClick={() => player.skip(1)}
          style={{ width: 48, height: 48, fontSize: 22 }}
        />
      </div>

      <Segmented<PlayerSource>
        block
        name="playerSource"
        aria-label="Voix de lecture"
        value={s.source}
        onChange={(v) => player.setSource(v)}
        options={SOURCE_OPTIONS}
      />
      {hd && (
        <span style={{ fontSize: 12, color: token.colorTextTertiary, textAlign: 'center' }}>
          Voix HD : synthèse payante (Gemini), environ 30 à 60 s la première fois, puis instantanée.
        </span>
      )}
      {s.error && <Alert type="error" showIcon message={s.error} />}
    </section>
  );
}

export default function Podcast() {
  const { token } = theme.useToken();
  const { message, modal } = AntApp.useApp();
  const isMobile = useIsMobile();
  const cats = usePodcastCategories();
  const eps = usePodcastEpisodes();
  const scriptMut = usePodcastScript();
  const settings = useUserSettings();
  const current = usePlayer();
  const { categories } = cats;

  const [newCat, setNewCat] = useState('');
  const [generating, setGenerating] = useState(false);
  // Choix explicite sur cette page ; sinon la durée suit le réglage utilisateur.
  const [durationOverride, setDurationOverride] = useState<PodcastDuration | null>(null);
  const duration = durationOverride ?? settings.podcastDuration;
  const [transcriptOf, setTranscriptOf] = useState<PodcastEpisodeDto | null>(null);

  const card = { background: token.colorBgContainer, borderRadius: 16, border: `1px solid ${token.colorBorderSecondary}` };

  const addCategory = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      message.info(`« ${name} » est déjà suivie.`);
      return;
    }
    setNewCat('');
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
      await eps.add({
        date: dayjs().format('YYYY-MM-DD'),
        categories: [...categories],
        script: result.script,
        sources: result.sources,
        durationEstimateSec: result.durationEstimateSec,
      });
      message.success('Épisode prêt. Touchez « Écouter ».');
    } catch (e) {
      message.error((e as Error).message || 'Échec de la génération.');
    } finally {
      setGenerating(false);
    }
  };

  const confirmDelete = (ep: PodcastEpisodeDto) =>
    modal.confirm({
      title: `Supprimer « ${episodeLabels(ep).title} » ?`,
      okText: 'Supprimer',
      okButtonProps: { danger: true },
      cancelText: 'Annuler',
      onOk: () => {
        if (current.episode?.id === ep.id) player.close();
        eps.remove(ep.id);
      },
    });

  const suggestions = SUGGESTIONS.filter((s) => !categories.some((c) => c.toLowerCase() === s.toLowerCase()));

  // Transcription : panneau du bas sur mobile, à droite sur PC.
  const closeTranscript = () => setTranscriptOf(null);
  const transcriptTitle = transcriptOf ? episodeLabels(transcriptOf).title : '';
  const transcript = transcriptOf && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.6 }}>{transcriptOf.script}</p>
      <section aria-labelledby="sources-title" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 id="sources-title" style={{ margin: 0, fontSize: 16 }}>
          Sources ({transcriptOf.sources.length})
        </h3>
        {transcriptOf.sources.map((s) => (
          <a key={s} href={s} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', fontSize: 13 }}>
            {s}
          </a>
        ))}
      </section>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760 }}>
      <PageHeader eyebrow="Brief audio des actualités" title="Podcast" />

      <NowPlaying />

      <section aria-labelledby="next-title" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionTitle id="next-title">Prochain épisode</SectionTitle>
        <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {cats.loading ? (
            <Skeleton active title={false} paragraph={{ rows: 1, width: '60%' }} />
          ) : cats.error ? (
            <Alert type="error" showIcon message="Impossible de charger tes catégories" description={cats.error.message} />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {categories.length === 0 && (
                <span style={{ color: token.colorTextSecondary }}>Choisis les thèmes de ton brief.</span>
              )}
              {categories.map((c) => (
                <Button
                  key={c}
                  shape="round"
                  aria-label={`Retirer la catégorie ${c}`}
                  onClick={() => cats.remove(c)}
                  style={{ height: 36, fontWeight: 600, background: token.colorFillTertiary, border: 0 }}
                >
                  {c} <CloseOutlined aria-hidden style={{ fontSize: 11, color: token.colorTextTertiary }} />
                </Button>
              ))}
            </div>
          )}

          <Input.Search
            aria-label="Nouvelle catégorie"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onSearch={addCategory}
            placeholder="Ajouter un thème (inflation, banques, IA…)"
            maxLength={CATEGORY_MAX_LENGTH}
            enterKeyHint="done"
            enterButton={<PlusOutlined aria-label="Ajouter" />}
            loading={cats.adding}
          />

          {!cats.loading && suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {suggestions.map((s) => (
                <Button key={s} size="small" type="dashed" shape="round" icon={<PlusOutlined />} aria-label={`Ajouter la catégorie ${s}`} onClick={() => addCategory(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span id="duration-label" style={{ fontSize: 14, color: token.colorTextSecondary }}>
              Durée
            </span>
            <Segmented<PodcastDuration>
              block
              name="episodeDuration"
              aria-labelledby="duration-label"
              style={{ flex: 1 }}
              value={duration}
              onChange={(v) => setDurationOverride(v)}
              options={DURATION_OPTIONS}
            />
          </div>

          <Button
            type="primary"
            size="large"
            block
            icon={<SoundOutlined />}
            loading={generating}
            disabled={categories.length === 0}
            onClick={onGenerate}
            style={{ height: 52, fontWeight: 700 }}
          >
            {generating ? 'Écriture du script…' : "Générer l'épisode du jour"}
          </Button>
          <span style={{ fontSize: 12, color: token.colorTextTertiary, textAlign: 'center' }}>
            Script écrit par Gemini à partir des actualités des dernières 24 h · environ 20 s
          </span>
        </div>
      </section>

      <section aria-labelledby="eps-title" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionTitle id="eps-title">Épisodes</SectionTitle>
        {eps.loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : eps.error ? (
          <Alert type="error" showIcon message="Impossible de charger tes épisodes" description={eps.error.message} />
        ) : eps.episodes.length === 0 ? (
          <div style={{ ...card, padding: 24 }}>
            <Empty description="Pas encore d'épisode. Génère le premier ci-dessus." />
          </div>
        ) : (
          <ul style={{ ...card, margin: 0, padding: 0, listStyle: 'none', overflow: 'hidden' }}>
            {eps.episodes.map((ep, i) => {
              const { title, subtitle } = episodeLabels(ep);
              const isCurrent = current.episode?.id === ep.id;
              return (
                <li
                  key={ep.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 4px 6px 8px',
                    borderTop: i === 0 ? undefined : `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Écouter ${title}`}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => (isCurrent ? player.toggle() : player.load(toPlayerEpisode(ep)))}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 56,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '0 8px',
                      border: 0,
                      background: 'transparent',
                      color: 'inherit',
                      textAlign: 'left',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        flex: '0 0 auto',
                        display: 'grid',
                        placeItems: 'center',
                        color: isCurrent ? '#0b0d12' : token.colorText,
                        background: isCurrent ? token.colorPrimary : token.colorFillTertiary,
                      }}
                    >
                      {isCurrent && current.status === 'playing' ? <PauseOutlined /> : <CaretRightFilled />}
                    </span>
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
                      <span
                        className="tabular-nums"
                        style={{ fontSize: 13, color: token.colorTextSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {formatDuration(ep.durationEstimateSec)} · {subtitle} · {ep.sources.length} sources
                      </span>
                    </span>
                  </button>
                  <ShareEpisode episodeId={ep.id} label={`Partager ${title}`} />
                  <Dropdown
                    trigger={['click']}
                    placement="bottomRight"
                    menu={{
                      items: [
                        { key: 'transcript', label: 'Transcription et sources', onClick: () => setTranscriptOf(ep) },
                        { type: 'divider' },
                        { key: 'delete', label: 'Supprimer', danger: true, onClick: () => confirmDelete(ep) },
                      ],
                    }}
                  >
                    <Button type="text" shape="circle" aria-label={`Plus d'actions pour ${title}`} icon={<MoreOutlined />} style={{ width: 44, height: 44 }} />
                  </Dropdown>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isMobile ? (
        <BottomSheet open={transcriptOf !== null} onClose={closeTranscript} title={transcriptTitle}>
          {transcript}
        </BottomSheet>
      ) : (
        <Drawer open={transcriptOf !== null} onClose={closeTranscript} placement="right" width={520} title={transcriptTitle}>
          {transcript}
        </Drawer>
      )}
    </div>
  );
}
