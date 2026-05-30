import axios, { type AxiosInstance } from 'axios';
import { runtimeConfig } from '@/lib/runtimeConfig';
import type {
  Quote,
  CompanyProfile,
  Candle,
  RecommendationTrend,
  PriceTarget,
  CompanyNewsItem,
  SymbolSearchResult,
  EarningsEvent,
} from '@/types/finnhub';
import type { NewsApiResponse } from '@/types/news';

/**
 * Client unique vers le BFF. Toutes les requêtes passent par le bearer
 * token. Pas de provider key côté navigateur.
 *
 * `baseURL` est initialisé dès le chargement du module à partir de
 * runtimeConfig (qui lit window.__APP_CONFIG__ rempli avant React).
 * Le token, lui, est setté plus tard par AuthProvider quand la session
 * Supabase est résolue.
 */

let baseURL = runtimeConfig.bffUrl.replace(/\/+$/, '');
let token = '';
let client: AxiosInstance | null = null;

export function configureApi(url: string, t: string) {
  baseURL = url.replace(/\/+$/, '');
  token = t;
  client = null;
}

function getClient(): AxiosInstance {
  if (!client) {
    client = axios.create({
      baseURL: baseURL || (typeof window !== 'undefined' ? window.location.origin : ''),
      timeout: 0,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  }
  return client;
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const res = await getClient().get<T>(`/api${path}`, { params });
  return res.data;
}

async function post<T, B = unknown>(path: string, body: B): Promise<T> {
  const res = await getClient().post<T>(`/api${path}`, body);
  return res.data;
}

async function put<T, B = unknown>(path: string, body: B): Promise<T> {
  const res = await getClient().put<T>(`/api${path}`, body);
  return res.data;
}

async function del<T>(path: string): Promise<T> {
  const res = await getClient().delete<T>(`/api${path}`);
  return res.data;
}

export interface TickerSentiment {
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  score: number;
  drivers: string[];
  summary: string;
}

export interface MarketThemes {
  themes: Array<{
    name: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    sectors: string[];
    summary: string;
  }>;
}

export interface PodcastScriptResult {
  script: string;
  sources: string[];
  durationEstimateSec: number;
}

export interface UserSettings {
  horizon: 'short' | 'medium' | 'long';
  theme: 'dark' | 'light';
}

export interface PodcastEpisodeDto {
  id: string;
  date: string;
  categories: string[];
  script: string;
  sources: string[];
  durationEstimateSec: number;
  createdAt: string;
}

export interface QuotaInfo {
  bucket: 'sentiment' | 'themes' | 'podcastScript' | 'podcastTts';
  used: number;
  remaining: number;
  limit: number;
  resetSec: number;
}

export interface ShareInfo {
  token: string;
  created_at: string;
  expires_at: string | null;
}

export const api = {
  quote: (symbol: string) => get<Quote>(`/quote/${encodeURIComponent(symbol)}`),

  profile: (symbol: string) => get<CompanyProfile>(`/profile/${encodeURIComponent(symbol)}`),

  candles: (symbol: string, resolution: 'D' | 'W' | 'M', lookbackDays: number) =>
    get<Candle>(`/candles/${encodeURIComponent(symbol)}`, { resolution, lookbackDays }),

  recommendations: (symbol: string) =>
    get<RecommendationTrend[] | null>(`/recommendations/${encodeURIComponent(symbol)}`),

  priceTarget: (symbol: string) =>
    get<PriceTarget | null>(`/price-target/${encodeURIComponent(symbol)}`),

  nextEarnings: (symbol: string) =>
    get<EarningsEvent | null>(`/earnings/${encodeURIComponent(symbol)}`),

  companyNews: (symbol: string, days = 14) =>
    get<CompanyNewsItem[]>(`/news/company/${encodeURIComponent(symbol)}`, { days }),

  marketNews: () => get<NewsApiResponse>('/news/market'),

  worldNews: (country = 'fr') => get<NewsApiResponse>('/news/world', { country }),

  businessNews: (country = 'fr') => get<NewsApiResponse>('/news/business', { country }),

  search: (q: string) => get<SymbolSearchResult>('/search', { q }),

  fxRates: () => get<Record<string, number>>('/fx'),

  tickerSentiment: (symbol: string) =>
    get<TickerSentiment>(`/analysis/sentiment/${encodeURIComponent(symbol)}`),

  marketThemes: (sectors: string[]) =>
    get<MarketThemes>('/analysis/themes', { sectors: sectors.join(',') }),

  podcastScript: (categories: string[], targetMinutes = 4) =>
    post<PodcastScriptResult>('/podcast/script', { categories, targetMinutes }),

  /** Renvoie un Uint8Array de PCM brut 16-bit 24kHz mono. Le caller wrap WAV. */
  podcastTts: async (text: string, speakers?: Record<string, string>): Promise<Uint8Array> => {
    const res = await getClient().post(
      '/api/podcast/tts',
      { text, speakers },
      { responseType: 'arraybuffer' },
    );
    return new Uint8Array(res.data as ArrayBuffer);
  },

  // -------- User data --------
  me: () => get<{ id: string; email?: string; role: string }>('/user/me'),

  getSettings: () => get<UserSettings>('/user/settings'),
  saveSettings: (s: Partial<UserSettings>) => put<{ ok: true }>('/user/settings', s),

  getWatchlist: () => get<{ tickers: string[] }>('/user/watchlist'),
  addToWatchlist: (ticker: string) => post<{ ok: true }>('/user/watchlist', { ticker }),
  removeFromWatchlist: (ticker: string) =>
    del<{ ok: true }>(`/user/watchlist/${encodeURIComponent(ticker)}`),

  getCategories: () => get<{ categories: string[] }>('/user/podcast/categories'),
  addCategory: (name: string) =>
    post<{ ok: true }>('/user/podcast/categories', { name }),
  removeCategory: (name: string) =>
    del<{ ok: true }>(`/user/podcast/categories/${encodeURIComponent(name)}`),

  getEpisodes: () => get<{ episodes: PodcastEpisodeDto[] }>('/user/podcast/episodes'),
  saveEpisode: (ep: Omit<PodcastEpisodeDto, 'id' | 'createdAt'>) =>
    post<{ id: string; createdAt: string }>('/user/podcast/episodes', ep),
  deleteEpisode: (id: string) =>
    del<{ ok: true }>(`/user/podcast/episodes/${encodeURIComponent(id)}`),

  getQuotas: () => get<{ quotas: QuotaInfo[] }>('/user/quotas'),

  // -------- Share épisode (owner side) --------
  getEpisodeShare: (id: string) =>
    get<ShareInfo | null>(`/user/podcast/episodes/${encodeURIComponent(id)}/share`),
  shareEpisode: (id: string) =>
    post<ShareInfo>(`/user/podcast/episodes/${encodeURIComponent(id)}/share`, {}),
  revokeShare: (id: string) =>
    del<{ ok: true }>(`/user/podcast/episodes/${encodeURIComponent(id)}/share`),

  // -------- Lecture publique d'un share --------
  // Les routes sont sous /api/public/* pour passer par le même handler Caddy
  // que /api/*. Le BFF skip l'auth pour ce prefix (cf src/auth.ts).
  getSharedEpisode: (token: string) =>
    get<PodcastEpisodeDto>(`/public/podcast/${encodeURIComponent(token)}`),

  sharedPodcastTts: async (
    token: string,
    text: string,
    speakers?: Record<string, string>,
  ): Promise<Uint8Array> => {
    const res = await getClient().post(
      `/api/public/podcast/${encodeURIComponent(token)}/tts`,
      { text, speakers },
      { responseType: 'arraybuffer' },
    );
    return new Uint8Array(res.data as ArrayBuffer);
  },
};
