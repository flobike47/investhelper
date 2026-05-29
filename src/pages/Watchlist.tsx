import { useState } from 'react';
import {
  Button,
  Card,
  Input,
  List,
  Popconfirm,
  Space,
  Typography,
  AutoComplete,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useWatchlist } from '@/store/watchlistStore';
import { finnhub } from '@/services/finnhub';
import { ApiKeyGate } from '@/components/common/ApiKeyGate';
import type { SymbolSearchResult } from '@/types/finnhub';

export default function Watchlist() {
  const { tickers, add, remove, reset } = useWatchlist();
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<{ value: string; label: React.ReactNode }[]>([]);
  const [searching, setSearching] = useState(false);

  const onSearch = async (q: string) => {
    setInput(q);
    if (q.length < 1) {
      setOptions([]);
      return;
    }
    setSearching(true);
    try {
      const res: SymbolSearchResult = await finnhub.search(q);
      setOptions(
        res.result.slice(0, 8).map((r) => ({
          value: r.symbol,
          label: (
            <Space>
              <strong>{r.displaySymbol}</strong>
              <span style={{ color: '#9ca3af' }}>{r.description}</span>
            </Space>
          ),
        })),
      );
    } catch {
      setOptions([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = (value?: string) => {
    const ticker = (value ?? input).trim().toUpperCase();
    if (!ticker) return;
    if (tickers.includes(ticker)) {
      message.info(`${ticker} est déjà dans ta watchlist.`);
      return;
    }
    add(ticker);
    setInput('');
    setOptions([]);
    message.success(`${ticker} ajouté.`);
  };

  return (
    <ApiKeyGate require={['finnhub']}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              Watchlist
            </Typography.Title>
            <Typography.Text type="secondary">
              Ajoute / supprime les tickers analysés par l'application.
            </Typography.Text>
          </div>
          <Popconfirm title="Réinitialiser la watchlist par défaut ?" onConfirm={reset}>
            <Button icon={<ReloadOutlined />}>Réinitialiser</Button>
          </Popconfirm>
        </Space>

        <Card>
          <Space.Compact style={{ width: '100%' }}>
            <AutoComplete
              style={{ flex: 1 }}
              value={input}
              options={options}
              onSearch={onSearch}
              onSelect={(v) => handleAdd(v)}
              notFoundContent={searching ? 'Recherche…' : null}
            >
              <Input
                placeholder="Symbole ou nom d'entreprise (ex: AAPL, Apple, VOO)"
                onPressEnter={() => handleAdd()}
                allowClear
              />
            </AutoComplete>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd()}>
              Ajouter
            </Button>
          </Space.Compact>
        </Card>

        <Card title={`${tickers.length} actif${tickers.length > 1 ? 's' : ''}`}>
          <List
            dataSource={tickers}
            renderItem={(t) => (
              <List.Item
                actions={[
                  <Popconfirm
                    key="del"
                    title={`Retirer ${t} ?`}
                    onConfirm={() => remove(t)}
                  >
                    <Button danger type="text" icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <Typography.Text strong>{t}</Typography.Text>
              </List.Item>
            )}
          />
        </Card>
      </Space>
    </ApiKeyGate>
  );
}
