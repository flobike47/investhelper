import { Alert, Button, Space } from 'antd';
import { Link } from 'react-router-dom';
import { useSettings } from '@/store/settingsStore';

interface Props {
  require: Array<'finnhub' | 'twelvedata' | 'newsapi' | 'gemini'>;
  children: React.ReactNode;
}

export function ApiKeyGate({ require, children }: Props) {
  const { finnhubKey, twelveDataKey, newsApiKey, geminiKey } = useSettings();
  const missing: string[] = [];
  if (require.includes('finnhub') && !finnhubKey && !import.meta.env.VITE_FINNHUB_API_KEY) {
    missing.push('Finnhub');
  }
  if (
    require.includes('twelvedata') &&
    !twelveDataKey &&
    !import.meta.env.VITE_TWELVE_DATA_API_KEY
  ) {
    missing.push('Twelve Data');
  }
  if (require.includes('newsapi') && !newsApiKey && !import.meta.env.VITE_NEWSAPI_API_KEY) {
    missing.push('NewsAPI');
  }
  if (require.includes('gemini') && !geminiKey && !import.meta.env.VITE_GEMINI_API_KEY) {
    missing.push('Gemini');
  }

  if (missing.length === 0) return <>{children}</>;

  return (
    <Alert
      type="warning"
      showIcon
      message={`Clé API manquante : ${missing.join(', ')}`}
      description={
        <Space direction="vertical">
          <span>
            Cette page a besoin de données réelles via {missing.join(' et ')}. Ajoute ta clé
            dans Réglages (ou dans le fichier .env).
          </span>
          <Link to="/settings">
            <Button type="primary">Aller dans Réglages</Button>
          </Link>
        </Space>
      }
    />
  );
}
