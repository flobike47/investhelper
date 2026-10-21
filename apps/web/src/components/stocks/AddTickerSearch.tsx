import { useMemo, useState } from 'react';
import { App as AntApp, AutoComplete, Input, Space, theme } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useSymbolSearch } from '@/hooks/useSymbolSearch';

/**
 * Champ « Ajouter un actif » : recherche debouncée (Finnhub) + ajout à la
 * watchlist. Le succès n'est annoncé qu'une fois confirmé par le serveur.
 */
export function AddTickerSearch() {
  const { tickers, addAsync } = useWatchlist();
  const { message } = AntApp.useApp();
  const { token } = theme.useToken();
  const [input, setInput] = useState('');
  // Liste ouverte : Entrée sélectionne une option (onSelect), il ne faut pas
  // en plus ajouter le texte brut saisi.
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
    addAsync(ticker).then(
      () => message.success(`${ticker} ajouté.`),
      () => {
        /* erreur et rollback gérés par le hook */
      },
    );
  };

  return (
    <AutoComplete
      style={{ width: '100%' }}
      value={input}
      options={options}
      onSearch={setInput}
      onSelect={(v) => handleAdd(v)}
      onOpenChange={setSuggestionsOpen}
      notFoundContent={searching ? 'Recherche…' : null}
    >
      <Input
        size="large"
        aria-label="Ajouter un actif à la watchlist"
        placeholder="Ajouter un actif (AAPL, LVMH, ETF…)"
        prefix={<SearchOutlined aria-hidden style={{ color: token.colorTextTertiary }} />}
        onPressEnter={() => {
          if (!(suggestionsOpen && options.length > 0)) handleAdd();
        }}
        allowClear
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        type="search"
      />
    </AutoComplete>
  );
}
