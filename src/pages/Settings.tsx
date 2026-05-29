import { Alert, Card, Form, Input, Radio, Space, Typography, Button, message } from 'antd';
import { useSettings } from '@/store/settingsStore';
import { HORIZON_LIST, type Horizon } from '@/constants/horizons';

export default function Settings() {
  const settings = useSettings();
  const [form] = Form.useForm();

  const onSave = (values: {
    finnhubKey: string;
    twelveDataKey: string;
    newsApiKey: string;
    geminiKey: string;
    fmpKey: string;
    yahooProxyUrl: string;
    yahooProxySecret: string;
    horizon: Horizon;
    theme: 'dark' | 'light';
  }) => {
    settings.setFinnhubKey(values.finnhubKey.trim());
    settings.setTwelveDataKey(values.twelveDataKey.trim());
    settings.setNewsApiKey(values.newsApiKey.trim());
    settings.setGeminiKey(values.geminiKey.trim());
    settings.setFmpKey(values.fmpKey.trim());
    settings.setYahooProxy(values.yahooProxyUrl.trim(), values.yahooProxySecret.trim());
    settings.setHorizon(values.horizon);
    settings.setTheme(values.theme);
    message.success('Réglages enregistrés.');
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 720 }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        Réglages
      </Typography.Title>

      <Alert
        type="warning"
        showIcon
        message="Sécurité des clés API"
        description={
          <>
            Les clés saisies ici sont stockées dans le localStorage de ton navigateur et envoyées
            directement aux fournisseurs depuis le client. C'est <strong>OK pour un usage perso/local</strong>,
            mais <strong>ne déploie pas l'app publiquement</strong> sans introduire un proxy backend
            pour cacher les clés.
          </>
        }
      />

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            finnhubKey: settings.finnhubKey,
            twelveDataKey: settings.twelveDataKey,
            newsApiKey: settings.newsApiKey,
            geminiKey: settings.geminiKey,
            fmpKey: settings.fmpKey,
            yahooProxyUrl: settings.yahooProxyUrl,
            yahooProxySecret: settings.yahooProxySecret,
            horizon: settings.horizon,
            theme: settings.theme,
          }}
          onFinish={onSave}
        >
          <Form.Item
            label="Clé Finnhub"
            name="finnhubKey"
            extra={
              <>
                Cotations temps r&eacute;el, recommandations analystes, news financi&egrave;res.{' '}
                <a href="https://finnhub.io/register" target="_blank" rel="noreferrer">
                  finnhub.io
                </a>
              </>
            }
          >
            <Input.Password placeholder="ex: cv********************" />
          </Form.Item>

          <Form.Item
            label="URL du proxy Yahoo Finance"
            name="yahooProxyUrl"
            extra={
              <>
                Cloudflare Worker que tu d&eacute;ploies pour acc&eacute;der aux donn&eacute;es
                analystes (recommandations + price targets + earnings) gratuitement via
                Yahoo Finance. Voir <code>worker/yahoo-proxy/README.md</code> du repo pour
                le d&eacute;ploiement (≈ 5 minutes).
              </>
            }
          >
            <Input placeholder="ex: https://investhelper-yahoo-proxy.xxx.workers.dev" />
          </Form.Item>

          <Form.Item
            label="Secret du proxy Yahoo (optionnel)"
            name="yahooProxySecret"
            extra="La cha&icirc;ne que tu as donn&eacute;e &agrave; `wrangler secret put PROXY_SECRET`. Laisser vide si tu n&apos;as pas configur&eacute; d&apos;auth sur le Worker."
          >
            <Input.Password placeholder="ex: ****************************" />
          </Form.Item>

          <Form.Item
            label="Clé Financial Modeling Prep"
            name="fmpKey"
            extra={
              <>
                Recommandations analystes et price targets (gratuit 250 req/jour).
                Remplace les endpoints Finnhub pass&eacute;s en premium.{' '}
                <a
                  href="https://site.financialmodelingprep.com/developer/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  site.financialmodelingprep.com
                </a>
              </>
            }
          >
            <Input.Password placeholder="ex: ****************************" />
          </Form.Item>

          <Form.Item
            label="Clé Twelve Data"
            name="twelveDataKey"
            extra={
              <>
                Historique OHLC pour les indicateurs techniques (RSI, SMA).{' '}
                <a href="https://twelvedata.com/register" target="_blank" rel="noreferrer">
                  twelvedata.com
                </a>{' '}
                — 800 req/jour gratuit.
              </>
            }
          >
            <Input.Password placeholder="ex: 32****************************" />
          </Form.Item>

          <Form.Item
            label="Clé Gemini (Google AI Studio)"
            name="geminiKey"
            extra={
              <>
                Analyse s&eacute;mantique des news (sentiment, th&egrave;mes) + g&eacute;n&eacute;ration
                du script de podcast quotidien. Cl&eacute; gratuite (1500 req/jour) :{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  aistudio.google.com/apikey
                </a>
              </>
            }
          >
            <Input.Password placeholder="ex: AIza****************************" />
          </Form.Item>

          <Form.Item
            label="Clé NewsAPI"
            name="newsApiKey"
            extra={
              <>
                Actualit&eacute;s monde / business.{' '}
                <a href="https://newsapi.org/register" target="_blank" rel="noreferrer">
                  newsapi.org
                </a>
              </>
            }
          >
            <Input.Password placeholder="ex: 7f************************" />
          </Form.Item>

          <Form.Item label="Horizon d'investissement par défaut" name="horizon">
            <Radio.Group>
              {HORIZON_LIST.map((h) => (
                <Radio.Button key={h.id} value={h.id}>
                  {h.label}
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>

          <Form.Item label="Thème" name="theme">
            <Radio.Group>
              <Radio.Button value="dark">Sombre</Radio.Button>
              <Radio.Button value="light">Clair</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              Enregistrer
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
