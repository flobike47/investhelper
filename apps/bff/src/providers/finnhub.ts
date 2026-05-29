import { config } from '../config.js';
import { createProviderClient, ProviderError, safe } from './http.js';
import type {
  Quote,
  CompanyProfile,
  RecommendationTrend,
  PriceTarget,
  CompanyNewsItem,
  SymbolSearchResult,
  EarningsEvent,
} from '../types.js';

const client = createProviderClient('https://finnhub.io/api/v1', 'Finnhub');

function token() {
  if (!config.finnhubKey) throw new ProviderError('FINNHUB_API_KEY non configurée', 503, 'Finnhub');
  return config.finnhubKey;
}

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const res = await client.get<T>(path, { params: { ...params, token: token() } });
  return res.data;
}

interface EarningsCalendar { earningsCalendar: EarningsEvent[] }

export const finnhub = {
  quote: (symbol: string) => get<Quote>('/quote', { symbol }),
  profile: (symbol: string) => get<CompanyProfile>('/stock/profile2', { symbol }),
  marketNews: () => get<CompanyNewsItem[]>('/news', { category: 'general' }),
  search: (q: string) => get<SymbolSearchResult>('/search', { q }),

  // Endpoints qui sont passés premium → safe()
  recommendations: (symbol: string) =>
    safe(() => get<RecommendationTrend[]>('/stock/recommendation', { symbol })),
  priceTarget: (symbol: string) =>
    safe(() => get<PriceTarget>('/stock/price-target', { symbol })),
  companyNews: (symbol: string, from: string, to: string) =>
    safe(() => get<CompanyNewsItem[]>('/company-news', { symbol, from, to })),
  earningsCalendar: (symbol: string, from: string, to: string) =>
    safe(() => get<EarningsCalendar>('/calendar/earnings', { symbol, from, to })),
};
