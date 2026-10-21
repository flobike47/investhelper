import { useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  AutoComplete,
  Button,
  Card,
  Input,
  List,
  Popconfirm,
  Space,
  Typography,
  theme,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useSymbolSearch } from '@/hooks/useSymbolSearch';

export default function Watchlist() {
  const { tickers, loading, error, addAsync, remove } = useWatchlist();
  const { message } = AntApp.useApp();
  const { token } = theme.useToken();
  const [input, setInput] = useState('');
  // Liste de suggestions ouverte : Entrée y sélectionne une option (onSelect),
  // il ne faut pas en plus ajouter le texte brut saisi.
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const { results, searching } = useSymbolSearch(input);

  const options = useMemo(
    () =>
      results.slice(0, 8).map((r) => ({
        value: r.symbol,
        label: (
          <Space>
            <strong>{r.displaySymbol}</strong>
            <span style={{ color: token.colorTextSecondary }}>{r.description}</span>
          </Space>
        ),
      })),
    [results, token.colorTextSecondary],
  );

  const handleAdd = (value?: string) => {
    const ticker = (value ?? input).trim().toUpperCase();
    if (!ticker) return;
    if (tickers.includes(ticker)) {
      message.info(`${ticker} est déjà dans ta watchlist.`);
      return;
    }
    setInput('');
    // Le succès n'est annoncé qu'une fois confirmé par le serveur ; en cas
    // d'échec, le hook annule l'ajout optimiste et affiche l'erreur.
    addAsync(ticker).then(
      () => message.success(`${ticker} ajouté.`),
      () => {
        /* erreur déjà affichée par le hook */
      },
    );
  };

  return (
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
      </Space>

      <Card>
        <Space.Compact style={{ width: '100%' }}>
          <AutoComplete
            style={{ flex: 1 }}
            value={input}
            options={options}
            onSearch={setInput}
            onSelect={(v) => handleAdd(v)}
            onOpenChange={setSuggestionsOpen}
            notFoundContent={searching ? 'Recherche…' : null}
          >
            <Input
              aria-label="Rechercher un ticker"
              placeholder="Symbole ou nom d'entreprise (ex: AAPL, Apple, VOO)"
              onPressEnter={() => {
                if (!(suggestionsOpen && options.length > 0)) handleAdd();
              }}
              allowClear
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </AutoComplete>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd()}>
            Ajouter
          </Button>
        </Space.Compact>
      </Card>

      {error && (
        <Alert type="error" showIcon message="Impossible de charger la watchlist" description={error.message} />
      )}

      <Card
        title={
          loading ? (
            'Actifs'
          ) : (
            <span className="tabular-nums">{`${tickers.length} actif${tickers.length > 1 ? 's' : ''}`}</span>
          )
        }
      >
        <List
          loading={loading}
          dataSource={tickers}
          locale={{ emptyText: 'Aucun ticker pour l’instant. Ajoute-en un ci-dessus.' }}
          renderItem={(t) => (
            <List.Item
              actions={[
                <Popconfirm key="del" title={`Retirer ${t} ?`} onConfirm={() => remove(t)}>
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    aria-label={`Retirer ${t} de la watchlist`}
                  />
                </Popconfirm>,
              ]}
            >
              <Typography.Text strong>{t}</Typography.Text>
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}
