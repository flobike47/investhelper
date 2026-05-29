import { config } from '../config.js';
import { createProviderClient, ProviderError } from './http.js';
import type { NewsApiResponse } from '../types.js';

const client = createProviderClient('https://newsapi.org/v2', 'NewsAPI');

function key() {
  if (!config.newsApiKey) throw new ProviderError('NEWSAPI_API_KEY non configurée', 503, 'NewsAPI');
  return config.newsApiKey;
}

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const res = await client.get<T>(path, { params: { ...params, apiKey: key() } });
  return res.data;
}

export const newsapi = {
  topHeadlines: (params: { country?: string; category?: string; pageSize?: number }) =>
    get<NewsApiResponse>('/top-headlines', {
      country: params.country ?? 'fr',
      category: params.category ?? 'general',
      pageSize: params.pageSize ?? 20,
    }),

  everything: (params: { q: string; language?: string; pageSize?: number }) =>
    get<NewsApiResponse>('/everything', {
      q: params.q,
      language: params.language ?? 'fr',
      sortBy: 'publishedAt',
      pageSize: params.pageSize ?? 20,
    }),
};
