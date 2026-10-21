import { useState } from 'react';
import { Alert, Button, Empty, Segmented, Skeleton, theme } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useBusinessNews, useMarketNews, useWorldNews } from '@/hooks/useNews';
import { describeError } from '@/lib/watchlistSummary';
import type { NewsApiArticle } from '@/types/news';
import { PageHeader } from '@/components/common/PageHeader';

dayjs.extend(relativeTime);

type Tab = 'world' | 'business' | 'markets';

const TABS: { value: Tab; label: string }[] = [
  { value: 'world', label: 'Monde' },
  { value: 'business', label: 'Économie' },
  { value: 'markets', label: 'Marchés' },
];

/** Image tierce : chargement différé, sans Referer ; masquée si elle échoue. */
function ArticleImage({ src, height, width }: { src: string; height: number; width?: number }) {
  const { token } = theme.useToken();
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        width: width ?? '100%',
        height,
        objectFit: 'cover',
        borderRadius: width ? 10 : 0,
        background: token.colorFillTertiary,
        flex: width ? `0 0 ${width}px` : undefined,
      }}
    />
  );
}

function meta(a: NewsApiArticle) {
  return `${a.source.name} · ${dayjs(a.publishedAt).fromNow()}`;
}

function Featured({ a }: { a: NewsApiArticle }) {
  const { token } = theme.useToken();
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 16, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, color: token.colorText }}
    >
      {a.urlToImage && <ArticleImage src={a.urlToImage} height={180} />}
      <span style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: token.colorInfoText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>À la une</span>
        <span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{a.title}</span>
        {a.description && (
          <span style={{ fontSize: 14, lineHeight: 1.45, color: token.colorTextSecondary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {a.description}
          </span>
        )}
        <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{meta(a)}</span>
      </span>
    </a>
  );
}

function ArticleList({ articles }: { articles: NewsApiArticle[] }) {
  const { token } = theme.useToken();
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', borderRadius: 16, overflow: 'hidden', background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}` }}>
      {articles.map((a, i) => (
        <li key={a.url} style={{ borderTop: i === 0 ? undefined : `1px solid ${token.colorBorderSecondary}` }}>
          <a href={a.url} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: 12, padding: '14px 16px', minHeight: 72, color: token.colorText }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {a.title}
              </span>
              <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{meta(a)}</span>
            </span>
            {a.urlToImage && <ArticleImage src={a.urlToImage} height={64} width={64} />}
          </a>
        </li>
      ))}
    </ul>
  );
}

function NewsFeed({ tab }: { tab: Tab }) {
  // Les trois hooks sont appelés (règles des hooks) mais seule la rubrique
  // affichée est interrogée ; les autres restent en cache TanStack Query.
  const world = useWorldNews('fr', tab === 'world');
  const business = useBusinessNews('fr', tab === 'business');
  const markets = useMarketNews(tab === 'markets');
  const q = tab === 'world' ? world : tab === 'business' ? business : markets;

  if (q.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (q.isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="Impossible de charger les actualités"
        description={describeError(q.error)}
        action={
          <Button size="small" onClick={() => void q.refetch()}>
            Réessayer
          </Button>
        }
      />
    );
  }
  const articles = (q.data?.articles ?? []).filter((a) => a.title && a.url);
  if (articles.length === 0) return <Empty description="Aucun article pour cette rubrique." />;
  const [first, ...rest] = articles;
  return (
    <>
      <Featured a={first} />
      {rest.length > 0 && <ArticleList articles={rest} />}
      <p style={{ margin: 0, fontSize: 12, textAlign: 'center', opacity: 0.7 }}>Les articles s'ouvrent sur le site de leur éditeur.</p>
    </>
  );
}

export default function News() {
  const [tab, setTab] = useState<Tab>('world');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
      <PageHeader eyebrow="Sélection NewsAPI, en français" title="Actualités" />
      <Segmented<Tab> block aria-label="Rubrique" value={tab} onChange={setTab} options={TABS} />
      <NewsFeed tab={tab} />
    </div>
  );
}
