import { createClient, ApiError } from './http';
import type { NewsApiResponse } from '@/types/news';

const BASE_URL = 'https://newsapi.org/v2';

let cachedKey: string | null = null;
let cachedClient: ReturnType<typeof createClient> | null = null;

export function setNewsApiKey(key: string | null) {
  cachedKey = key;
  cachedClient = null;
}

function getClient() {
  if (!cachedClient) {
    cachedClient = createClient(BASE_URL, 'NewsAPI');
  }
  return cachedClient;
}

function requireKey(): string {
  const key = cachedKey || import.meta.env.VITE_NEWSAPI_API_KEY;
  if (!key) {
    throw new ApiError(
      'Clé NewsAPI manquante. Renseigne-la dans Réglages ou dans .env (VITE_NEWSAPI_API_KEY).',
      401,
      'NewsAPI',
    );
  }
  return key;
}

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const apiKey = requireKey();
  const res = await getClient().get<T>(path, { params: { ...params, apiKey } });
  return res.data;
}

export const newsapi = {
  topHeadlines: (params: {
    country?: string;
    category?: 'business' | 'general' | 'technology';
    pageSize?: number;
  }) =>
    get<NewsApiResponse>('/top-headlines', {
      country: params.country ?? 'us',
      category: params.category ?? 'business',
      pageSize: params.pageSize ?? 20,
    }),

  everything: (params: { q: string; pageSize?: number; language?: string }) =>
    get<NewsApiResponse>('/everything', {
      q: params.q,
      language: params.language ?? 'en',
      sortBy: 'publishedAt',
      pageSize: params.pageSize ?? 20,
    }),
};
