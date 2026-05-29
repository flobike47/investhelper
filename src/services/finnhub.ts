import { createClient, ApiError } from './http';
import type {
  Quote,
  CompanyProfile,
  Candle,
  RecommendationTrend,
  PriceTarget,
  CompanyNewsItem,
  SymbolSearchResult,
  EarningsCalendarResponse,
} from '@/types/finnhub';

const BASE_URL = 'https://finnhub.io/api/v1';

let cachedKey: string | null = null;
let cachedClient: ReturnType<typeof createClient> | null = null;

/**
 * The key is read lazily: either from the runtime settings store
 * (via getApiKey) or, as a fallback, from VITE_FINNHUB_API_KEY.
 */
export function setFinnhubKey(key: string | null) {
  cachedKey = key;
  cachedClient = null;
}

function getClient() {
  if (!cachedClient) {
    cachedClient = createClient(BASE_URL, 'Finnhub');
  }
  return cachedClient;
}

function requireKey(): string {
  const key = cachedKey || import.meta.env.VITE_FINNHUB_API_KEY;
  if (!key) {
    throw new ApiError(
      'Clé Finnhub manquante. Renseigne-la dans Réglages ou dans .env (VITE_FINNHUB_API_KEY).',
      401,
      'Finnhub',
    );
  }
  return key;
}

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const token = requireKey();
  const res = await getClient().get<T>(path, { params: { ...params, token } });
  return res.data;
}

/**
 * Variant that swallows 403/401 and returns null. Used for endpoints that
 * Finnhub has progressively moved to premium plans (price-target,
 * recommendation, earnings calendar). The rest of the app handles null
 * gracefully so the score still computes from technicals + sentiment.
 */
async function tryGet<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T | null> {
  try {
    return await get<T>(path, params);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
      return null;
    }
    throw e;
  }
}

export const finnhub = {
  quote: (symbol: string) => get<Quote>('/quote', { symbol }),

  profile: (symbol: string) => get<CompanyProfile>('/stock/profile2', { symbol }),

  candles: (symbol: string, resolution: 'D' | 'W' | 'M', from: number, to: number) =>
    get<Candle>('/stock/candle', { symbol, resolution, from, to }),

  recommendations: (symbol: string) =>
    tryGet<RecommendationTrend[]>('/stock/recommendation', { symbol }),

  priceTarget: (symbol: string) => tryGet<PriceTarget>('/stock/price-target', { symbol }),

  companyNews: (symbol: string, from: string, to: string) =>
    tryGet<CompanyNewsItem[]>('/company-news', { symbol, from, to }),

  marketNews: (category: 'general' | 'forex' | 'crypto' | 'merger' = 'general') =>
    get<CompanyNewsItem[]>('/news', { category }),

  search: (q: string) => get<SymbolSearchResult>('/search', { q }),

  earningsCalendar: (symbol: string, from: string, to: string) =>
    tryGet<EarningsCalendarResponse>('/calendar/earnings', { symbol, from, to }),
};
