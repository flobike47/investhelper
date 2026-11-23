import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Empty, Skeleton, theme } from 'antd';
import { CaretRightFilled, LinkOutlined, LoadingOutlined, PauseOutlined } from '@ant-design/icons';
import { usePodcastEpisodes } from '@/hooks/usePodcast';
import { episodeLabels, player, toPlayerEpisode, usePlayer } from '@/hooks/usePlayer';
import type { PlayerState } from '@/lib/player';
import type { PodcastEpisodeDto, SourceDetailDto, TopicDto } from '@/services/api';
import { PageHeader } from '@/components/common/PageHeader';
import { ShareEpisode } from '@/components/podcast/ShareEpisode';
import { formatClock, formatDuration } from '@/lib/format';
import { isHttpUrl, parseSourceUrl, type ParsedSource } from '@/lib/sources';

/** Nombre de sources visibles sous un sujet avant « Voir N autres sources ». */
const SOURCES_SHOWN = 2;

/** Vignette « ih » (même style que le grand lecteur de la page Podcast). */
function Thumb() {
  const { token } = theme.useToken();
  return (
    <span
      aria-hidden
      style={{ width: 72, height: 72, borderRadius: 18, background: token.colorPrimary, color: '#0b0d12', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 26, flex: '0 0 auto' }}
    >
      ih
    </span>
  );
}

/** Une source du détail : titre et média du BFF, sinon déduits de l'URL. */
interface SourceItem {
  url: string;
  view: ParsedSource;
  category: string | null;
}

function sourceItems(ep: PodcastEpisodeDto): SourceItem[] {
  const details = new Map<string, SourceDetailDto>((ep.sourceDetails ?? []).map((d) => [d.url, d]));
  return ep.sources.map((url) => {
    const parsed = parseSourceUrl(url);
    const detail = details.get(url);
    return {
      url,
      category: detail?.category ?? null,
      view: {
        ...parsed,
        title: detail?.title || parsed.title,
        publisher: detail?.publisher || parsed.publisher,
      },
    };
  });
}

/**
 * Range chaque source sous le premier sujet de même catégorie. Les sources sans
 * sujet correspondant vont dans `others`.
 */
function groupByTopic(topics: TopicDto[], items: SourceItem[]) {
  const firstTopicOf = new Map<string, number>();
  topics.forEach((t, i) => {
    if (t.category && !firstTopicOf.has(t.category)) firstTopicOf.set(t.category, i);
  });
  const perTopic: SourceItem[][] = topics.map(() => []);
  const others: SourceItem[] = [];
  for (const item of items) {
    const idx = item.category ? firstTopicOf.get(item.category) : undefined;
    if (idx === undefined) others.push(item);
    else perTopic[idx].push(item);
  }
  return { perTopic, others };
}

/** Index du sujet en cours : le dernier dont le début est déjà atteint, sinon -1. */
function currentTopicIndex(topics: TopicDto[], progress: number): number {
  let k = -1;
  topics.forEach((t, i) => {
    if (progress >= t.startRatio) k = i;
  });
  return k;
}

/** Une source : pastille du média, titre (2 lignes max), média · hôte, lien externe. */
function SourceRow({ source }: { source: ParsedSource }) {
  const { token } = theme.useToken();
  const secondary = source.publisher === source.host ? source.host : `${source.publisher} · ${source.host}`;
  const content = (
    <>
      <span
        aria-hidden
        style={{ width: 36, height: 36, borderRadius: 10, flex: '0 0 auto', display: 'grid', placeItems: 'center', fontWeight: 700, color: token.colorText, background: token.colorFillTertiary }}
      >
        {source.publisher.charAt(0).toUpperCase()}
      </span>
      <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {source.title}
        </span>
        <span style={{ fontSize: 13, color: token.colorTextSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {secondary}
        </span>
      </span>
      <LinkOutlined aria-hidden style={{ flex: '0 0 auto', fontSize: 16, color: token.colorTextTertiary }} />
    </>
  );
  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    padding: '10px 16px',
    color: token.colorText,
    textDecoration: 'none',
  } as const;

  // Seules les URL http(s) deviennent des liens cliquables.
  return isHttpUrl(source.url) ? (
    <a href={source.url} target="_blank" rel="noreferrer" style={rowStyle}>
      {content}
    </a>
  ) : (
    <div style={rowStyle}>{content}</div>
  );
}

/** Liste de sources en carte (pleine largeur, séparateurs entre lignes). */
function SourceList({ items }: { items: SourceItem[] }) {
  const { token } = theme.useToken();
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', overflow: 'hidden' }}>
      {items.map((s, i) => (
        <li key={s.url} style={{ borderTop: i === 0 ? undefined : `1px solid ${token.colorBorderSecondary}` }}>
          <SourceRow source={s.view} />
        </li>
      ))}
    </ul>
  );
}

/** Sources rangées sous un sujet : deux visibles, puis un bouton pour le reste. */
function TopicSources({ items }: { items: SourceItem[] }) {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const hidden = items.length - SOURCES_SHOWN;
  const label = open
    ? 'Voir moins'
    : `Voir ${hidden} autre${hidden > 1 ? 's' : ''} source${hidden > 1 ? 's' : ''}`;
  return (
    <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}>
      <SourceList items={open ? items : items.slice(0, SOURCES_SHOWN)} />
      {items.length > SOURCES_SHOWN && (
        <Button
          type="text"
          block
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{ height: 44, color: token.colorPrimaryText, fontWeight: 600 }}
        >
          {label}
        </Button>
      )}
    </div>
  );
}

interface TopicBlockProps {
  topic: TopicDto;
  durationSec: number;
  current: boolean;
  playingHere: boolean;
  sources: SourceItem[];
  onPlay: () => void;
}

/** Un sujet : bouton pour écouter à partir de son début, résumé, sources dessous. */
function TopicBlock({ topic, durationSec, current, playingHere, sources, onPlay }: TopicBlockProps) {
  const { token } = theme.useToken();
  const clock = formatClock(Math.round(topic.startRatio * durationSec));
  const action = playingHere ? 'Pause' : 'Écouter';
  return (
    <article
      aria-current={current ? 'true' : undefined}
      style={{
        background: token.colorBgContainer,
        borderRadius: 16,
        border: `1px solid ${current ? token.colorPrimary : token.colorBorderSecondary}`,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onPlay}
        aria-label={`${action} ${topic.title} à partir de ${clock}`}
        style={{
          width: '100%',
          minHeight: 44,
          display: 'grid',
          gridTemplateColumns: '36px minmax(0, 1fr)',
          gap: 12,
          alignItems: 'start',
          padding: 14,
          border: 0,
          background: 'none',
          color: token.colorText,
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
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: current ? token.colorPrimary : token.colorFillTertiary,
            color: current ? '#0b0d12' : token.colorText,
          }}
        >
          {playingHere ? <PauseOutlined /> : <CaretRightFilled />}
        </span>
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{topic.title}</span>
            <span className="tabular-nums" style={{ fontSize: 13, color: token.colorTextSecondary }}>
              {clock}
            </span>
          </span>
          <span style={{ fontSize: 14, lineHeight: 1.45, color: token.colorTextSecondary }}>{topic.summary}</span>
        </span>
      </button>
      <TopicSources items={sources} />
    </article>
  );
}

/** Section « Dans cet épisode » : un bloc par sujet, puis les sources sans sujet. */
function TopicsSection({
  ep,
  topics,
  items,
  current,
}: {
  ep: PodcastEpisodeDto;
  topics: TopicDto[];
  items: SourceItem[];
  current: PlayerState;
}) {
  const { token } = theme.useToken();
  const isCurrent = current.episode?.id === ep.id;
  const activeIndex = isCurrent && current.status !== 'idle' && current.status !== 'loading'
    ? currentTopicIndex(topics, current.progress)
    : -1;
  const { perTopic, others } = groupByTopic(topics, items);
  const card = { background: token.colorBgContainer, borderRadius: 16, border: `1px solid ${token.colorBorderSecondary}` };

  const onTopic = (i: number) => {
    if (isCurrent && i === activeIndex && current.status === 'playing') {
      player.pause();
      return;
    }
    player.seekTo(topics[i].startRatio, toPlayerEpisode(ep));
  };

  return (
    <>
      <section aria-labelledby="topics-title" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 4px' }}>
          <h2 id="topics-title" style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Dans cet épisode
          </h2>
          <span
            style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: token.colorFillTertiary, color: token.colorTextSecondary }}
          >
            IA
          </span>
        </div>
        {topics.map((t, i) => (
          <TopicBlock
            key={`${i}-${t.title}`}
            topic={t}
            durationSec={ep.durationEstimateSec}
            current={i === activeIndex}
            playingHere={i === activeIndex && current.status === 'playing'}
            sources={perTopic[i]}
            onPlay={() => onTopic(i)}
          />
        ))}
        <p style={{ margin: '0 4px', fontSize: 12, color: token.colorTextTertiary }}>
          Résumé généré par IA à partir du script. Ce n'est pas un conseil en investissement.
        </p>
      </section>

      {others.length > 0 && (
        <section aria-labelledby="other-sources-title" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 id="other-sources-title" style={{ margin: '0 4px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Autres sources
          </h2>
          <div style={{ ...card }}>
            <SourceList items={others} />
          </div>
        </section>
      )}
    </>
  );
}

function EpisodeDetail({ ep }: { ep: PodcastEpisodeDto }) {
  const { token } = theme.useToken();
  const current = usePlayer();
  const { title } = episodeLabels(ep);
  const isCurrent = current.episode?.id === ep.id;
  const playing = isCurrent && current.status === 'playing';
  const loading = isCurrent && current.status === 'loading';
  const items = sourceItems(ep);
  const topics = ep.topics ?? [];
  const card = { background: token.colorBgContainer, borderRadius: 16, border: `1px solid ${token.colorBorderSecondary}` };

  const onPlay = () => (isCurrent ? player.toggle() : player.load(toPlayerEpisode(ep)));

  return (
    <>
      <section
        aria-label="Épisode"
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
          <Thumb />
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ul aria-label="Catégories" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ep.categories.map((c) => (
                <li
                  key={c}
                  style={{ fontSize: 13, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: token.colorFillTertiary }}
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="tabular-nums" style={{ margin: 0, fontSize: 13, color: token.colorTextSecondary }}>
          {formatDuration(ep.durationEstimateSec)} · Alex &amp; Sophie · {items.length} {items.length > 1 ? 'sources' : 'source'}
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button
            type="primary"
            size="large"
            aria-label={`${playing ? 'Pause' : 'Écouter'} ${title}`}
            aria-current={isCurrent ? 'true' : undefined}
            disabled={loading}
            icon={loading ? <LoadingOutlined /> : playing ? <PauseOutlined /> : <CaretRightFilled />}
            onClick={onPlay}
            style={{ height: 52, minWidth: 140, fontWeight: 700 }}
          >
            {playing ? 'Pause' : 'Écouter'}
          </Button>
          <ShareEpisode episodeId={ep.id} label={`Partager ${title}`} />
        </div>
      </section>

      {topics.length > 0 ? (
        <TopicsSection ep={ep} topics={topics} items={items} current={current} />
      ) : (
        <section aria-labelledby="sources-title" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 id="sources-title" style={{ margin: '0 4px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Sources ({items.length})
          </h2>
          {items.length === 0 ? (
            <div style={{ ...card, padding: 24 }}>
              <Empty description="Aucune source pour cet épisode." />
            </div>
          ) : (
            <div style={{ ...card, overflow: 'hidden' }}>
              <SourceList items={items} />
            </div>
          )}
        </section>
      )}
    </>
  );
}

export default function PodcastEpisode() {
  const { id = '' } = useParams();
  const eps = usePodcastEpisodes();
  const ep = eps.episodes.find((e) => e.id === id);
  const { token } = theme.useToken();

  let body;
  if (eps.loading) {
    body = <Skeleton active paragraph={{ rows: 5 }} />;
  } else if (eps.error) {
    body = <Alert type="error" showIcon message="Impossible de charger cet épisode" description={eps.error.message} />;
  } else if (!ep) {
    body = (
      <div style={{ borderRadius: 16, border: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer, padding: 24 }}>
        <Empty description="Cet épisode n'existe pas ou a été supprimé.">
          <Link to="/podcast" style={{ color: token.colorPrimaryText, fontWeight: 600 }}>
            Retour au podcast
          </Link>
        </Empty>
      </div>
    );
  } else {
    body = <EpisodeDetail ep={ep} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760 }}>
      <PageHeader back={{ to: '/podcast', label: 'Podcast' }} title={ep ? episodeLabels(ep).title : 'Épisode'} />
      {body}
    </div>
  );
}
