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

/** Requêtes de données. Les générations IA passent un timeout plus long. */
const DEFAULT_TIMEOUT_MS = 20_000;
const GENERATION_TIMEOUT_MS = 120_000;

let baseURL = runtimeConfig.bffUrl.replace(/\/+$/, '');
let token = '';
let client: AxiosInstance | null = null;

export function configureApi(url: string, t: string) {
  baseURL = url.replace(/\/+$/, '');
  token = t;
  client = null;
}

/** Erreur renvoyée par le BFF : message lisible + reqId pour retrouver le log serveur. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public reqId: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Extrait `{ error, reqId }` du corps, y compris pour les réponses binaires (TTS). */
function readErrorBody(data: unknown): { error?: string; reqId?: string } {
  try {
    // toString plutôt qu'instanceof : robuste aux ArrayBuffer d'un autre realm
    if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') {
      data = JSON.parse(new TextDecoder().decode(data as ArrayBuffer));
    }
    if (data && typeof data === 'object') return data as { error?: string; reqId?: string };
  } catch {
    /* corps non JSON */
  }
  return {};
}

export function toApiError(err: unknown): ApiError {
  if (!axios.isAxiosError(err)) return new ApiError((err as Error)?.message ?? 'Erreur inconnue', null, null);
  if (err.code === 'ECONNABORTED') return new ApiError('Le serveur met trop de temps à répondre.', null, null);
  if (!err.response) return new ApiError('Serveur injoignable. Vérifie ta connexion.', null, null);
  const body = readErrorBody(err.response.data);
  return new ApiError(
    body.error ?? `Erreur ${err.response.status}`,
    err.response.status,
    body.reqId ?? null,
  );
}

function getClient(): AxiosInstance {
  if (!client) {
    client = axios.create({
      baseURL: baseURL || (typeof window !== 'undefined' ? window.location.origin : ''),
      timeout: DEFAULT_TIMEOUT_MS,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    client.interceptors.response.use(undefined, (err) => Promise.reject(toApiError(err)));
  }
  return client;
}

async function get<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await getClient().get<T>(`/api${path}`, { params, signal });
  return res.data;
}

async function post<T, B = unknown>(path: string, body: B, timeout?: number): Promise<T> {
  const res = await getClient().post<T>(`/api${path}`, body, { timeout });
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

export type PodcastDuration = 'auto' | '2' | '4' | '8';

export interface UserSettings {
  horizon: 'short' | 'medium' | 'long';
  theme: 'dark' | 'light';
  podcastDuration: PodcastDuration;
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

export interface SharedEpisodeDto extends PodcastEpisodeDto {
  /** Nombre de chunks audio HD à demander à /tts (index 0..n-1). */
  ttsChunkCount: number;
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

  /** `signal` : annule la requête HTTP quand la saisie change (TanStack Query le fournit). */
  search: (q: string, signal?: AbortSignal) => get<SymbolSearchResult>('/search', { q }, signal),

  fxRates: () => get<Record<string, number>>('/fx'),

  tickerSentiment: (symbol: string) =>
    get<TickerSentiment>(`/analysis/sentiment/${encodeURIComponent(symbol)}`),

  marketThemes: (sectors: string[]) =>
    get<MarketThemes>('/analysis/themes', { sectors: sectors.join(',') }),

  podcastScript: (categories: string[], targetMinutes: number | 'auto' = 'auto') =>
    post<PodcastScriptResult>('/podcast/script', { categories, targetMinutes }, GENERATION_TIMEOUT_MS),

  /** Renvoie un Uint8Array de PCM brut 16-bit 24kHz mono. Le caller wrap WAV. */
  podcastTts: async (text: string, speakers?: Record<string, string>): Promise<Uint8Array> => {
    const res = await getClient().post(
      '/api/podcast/tts',
      { text, speakers },
      { responseType: 'arraybuffer', timeout: GENERATION_TIMEOUT_MS },
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
    get<SharedEpisodeDto>(`/public/podcast/${encodeURIComponent(token)}`),

  /** Le serveur découpe lui-même le script : on ne demande qu'un index de chunk. */
  sharedPodcastTts: async (token: string, chunkIndex: number): Promise<Uint8Array> => {
    const res = await getClient().post(
      `/api/public/podcast/${encodeURIComponent(token)}/tts`,
      { chunkIndex },
      { responseType: 'arraybuffer', timeout: GENERATION_TIMEOUT_MS },
    );
    return new Uint8Array(res.data as ArrayBuffer);
  },
};
