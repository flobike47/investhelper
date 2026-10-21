import { Alert, Button, Card, Col, Row, Space, Tabs, Typography, Empty, Image, theme } from 'antd';
import { useBusinessNews, useMarketNews, useWorldNews } from '@/hooks/useNews';
import { describeError } from '@/lib/watchlistSummary';
import type { NewsApiArticle } from '@/types/news';
import dayjs from 'dayjs';

/** Image de repli transparente : laisse voir le fond du thème (clair ou sombre). */
const TRANSPARENT_PIXEL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>";

function ArticleCard({
  title,
  description,
  source,
  date,
  image,
  url,
}: {
  title: string;
  description: string | null;
  source: string;
  date: string;
  image: string | null;
  url: string;
}) {
  const { token } = theme.useToken();
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
      <Card hoverable styles={{ body: { padding: 14 } }} style={{ height: '100%' }}>
        {image && (
          <div
            style={{
              marginBottom: 10,
              borderRadius: 6,
              overflow: 'hidden',
              // Fond du thème visible pendant le chargement et si l'image échoue
              background: token.colorFillTertiary,
            }}
          >
            {/* Images tierces : chargement différé, décodage hors thread principal,
                pas de Referer envoyé (rc-image transmet ces attributs à <img>). */}
            <Image
              src={image}
              alt=""
              preview={false}
              height={140}
              width="100%"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              style={{ objectFit: 'cover' }}
              fallback={TRANSPARENT_PIXEL}
            />
          </div>
        )}
        <Typography.Text strong style={{ fontSize: 14 }}>
          {title}
        </Typography.Text>
        {description && (
          <Typography.Paragraph
            type="secondary"
            ellipsis={{ rows: 2 }}
            style={{ fontSize: 12, marginTop: 6, marginBottom: 6 }}
          >
            {description}
          </Typography.Paragraph>
        )}
        <Typography.Text type="secondary" className="tabular-nums" style={{ fontSize: 11 }}>
          {source} · {date}
        </Typography.Text>
      </Card>
    </a>
  );
}

type NewsQuery =
  | ReturnType<typeof useWorldNews>
  | ReturnType<typeof useBusinessNews>
  | ReturnType<typeof useMarketNews>;

function WorldNewsTab() {
  return <NewsApiGrid query={useWorldNews()} />;
}
function BusinessNewsTab() {
  return <NewsApiGrid query={useBusinessNews()} />;
}
function MarketsTab() {
  return <NewsApiGrid query={useMarketNews()} />;
}

function NewsApiGrid({ query }: { query: NewsQuery }) {
  if (query.isLoading) return <Card loading />;
  const articles: NewsApiArticle[] | undefined = query.data?.articles;
  if (query.isError && !articles?.length) {
    return (
      <Alert
        type="error"
        showIcon
        message="Impossible de charger les actualités"
        description={describeError(query.error)}
        action={
          <Button size="small" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        }
      />
    );
  }
  if (!articles?.length) return <Empty description="Aucun article pour le moment" />;
  return (
    <Row gutter={[16, 16]}>
      {articles.map((a) => (
        <Col key={a.url} xs={24} sm={12} lg={8}>
          <ArticleCard
            title={a.title}
            description={a.description}
            source={a.source.name}
            date={dayjs(a.publishedAt).format('DD MMM HH:mm')}
            image={a.urlToImage}
            url={a.url}
          />
        </Col>
      ))}
    </Row>
  );
}

export default function News() {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        Actualités
      </Typography.Title>
      <Tabs
        defaultActiveKey="world"
        items={[
          { key: 'world', label: 'Monde', children: <WorldNewsTab /> },
          { key: 'business', label: 'Économie', children: <BusinessNewsTab /> },
          { key: 'markets', label: 'Marchés financiers', children: <MarketsTab /> },
        ]}
      />
    </Space>
  );
}
