import { Card, Col, Row, Space, Tabs, Typography, Empty, Image } from 'antd';
import { useBusinessNews, useMarketNews, useWorldNews } from '@/hooks/useNews';
import { ApiKeyGate } from '@/components/common/ApiKeyGate';
import type { NewsApiArticle } from '@/types/news';
import dayjs from 'dayjs';

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
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
      <Card hoverable styles={{ body: { padding: 14 } }} style={{ height: '100%' }}>
        {image && (
          <div style={{ marginBottom: 10, borderRadius: 6, overflow: 'hidden' }}>
            <Image
              src={image}
              alt=""
              preview={false}
              height={140}
              width="100%"
              style={{ objectFit: 'cover' }}
              fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMxOTFlMjciLz48L3N2Zz4="
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
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {source} · {date}
        </Typography.Text>
      </Card>
    </a>
  );
}

function WorldNewsTab() {
  const world = useWorldNews();
  return (
    <ApiKeyGate require={['newsapi']}>
      <NewsApiGrid loading={world.isLoading} articles={world.data?.articles} />
    </ApiKeyGate>
  );
}
function BusinessNewsTab() {
  const business = useBusinessNews();
  return (
    <ApiKeyGate require={['newsapi']}>
      <NewsApiGrid loading={business.isLoading} articles={business.data?.articles} />
    </ApiKeyGate>
  );
}
function MarketsTab() {
  const market = useMarketNews();
  return (
    <ApiKeyGate require={['newsapi']}>
      <NewsApiGrid loading={market.isLoading} articles={market.data?.articles} />
    </ApiKeyGate>
  );
}

function NewsApiGrid({
  loading,
  articles,
}: {
  loading: boolean;
  articles: NewsApiArticle[] | undefined;
}) {
  if (loading) return <Card loading />;
  if (!articles?.length) return <Empty />;
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
