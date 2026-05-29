/**
 * Heuristique d'inférence de la devise native d'un ticker à partir de son
 * suffixe d'exchange (norme Yahoo Finance / Twelve Data). Les tickers US
 * "plats" (AAPL, NVDA, etc.) sont supposés en USD.
 *
 * Cas particulier : la plupart des ETFs UCITS listés à Londres (CSPX.L,
 * EQQQ.L, VWRA.L...) sont libellés en USD malgré le suffixe .L. On les
 * traite à part.
 */

const SUFFIX_TO_CURRENCY: Record<string, string> = {
  '.PA': 'EUR', '.AS': 'EUR', '.DE': 'EUR', '.MI': 'EUR',
  '.MC': 'EUR', '.LS': 'EUR', '.BR': 'EUR', '.VI': 'EUR',
  '.HE': 'EUR', '.IR': 'EUR',
  '.L': 'GBP',
  '.SW': 'CHF',
  '.T': 'JPY', '.TYO': 'JPY',
  '.HK': 'HKD',
  '.TO': 'CAD', '.V': 'CAD',
  '.AX': 'AUD',
};

const USD_DENOMINATED_LONDON_ETFS = new Set([
  'CSPX.L', 'EQQQ.L', 'VWRA.L', 'VWRP.L', 'IWDA.L', 'EIMI.L', 'SWDA.L',
]);

export function inferCurrency(symbol: string): string {
  if (USD_DENOMINATED_LONDON_ETFS.has(symbol)) return 'USD';
  for (const [suffix, curr] of Object.entries(SUFFIX_TO_CURRENCY)) {
    if (symbol.endsWith(suffix)) return curr;
  }
  return 'USD';
}

/**
 * @param rates { USD: 1.04, GBP: 0.83, ... } where 1 EUR = X currency
 */
export function convertToEur(
  amount: number,
  currency: string,
  rates: Record<string, number> | null | undefined,
): number {
  if (currency === 'EUR') return amount;
  const rate = rates?.[currency];
  if (!rate || rate === 0) return amount; // pas de taux disponible → on laisse brut
  return amount / rate;
}

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nativeFormatters = new Map<string, Intl.NumberFormat>();
function getNativeFormatter(currency: string): Intl.NumberFormat {
  let fmt = nativeFormatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    nativeFormatters.set(currency, fmt);
  }
  return fmt;
}

export function formatEur(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  return eurFormatter.format(amount);
}

export function formatNative(
  amount: number | null | undefined,
  currency: string,
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  try {
    return getNativeFormatter(currency).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Tente de formater en EUR. Si les taux ne sont pas encore chargés (ou ne
 * couvrent pas la devise native), retourne le prix natif avec le bon symbole
 * — sans jamais étiqueter un montant non converti comme étant en euros.
 */
export function priceToEur(
  amount: number | null | undefined,
  symbol: string,
  rates: Record<string, number> | null | undefined,
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  const currency = inferCurrency(symbol);
  if (currency === 'EUR') return formatEur(amount);
  const rate = rates?.[currency];
  if (!rate || rate === 0) return formatNative(amount, currency);
  return formatEur(amount / rate);
}
