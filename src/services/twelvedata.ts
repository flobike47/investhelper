import { createClient, ApiError } from './http';
import type { Candle } from '@/types/finnhub';

const BASE_URL = 'https://api.twelvedata.com';

let cachedKey: string | null = null;
let cachedClient: ReturnType<typeof createClient> | null = null;

export function setTwelveDataKey(key: string | null) {
  cachedKey = key;
  cachedClient = null;
}

function getClient() {
  if (!cachedClient) cachedClient = createClient(BASE_URL, 'Twelve Data');
  return cachedClient;
}

function requireKey(): string {
  const key = cachedKey || import.meta.env.VITE_TWELVE_DATA_API_KEY;
  if (!key) {
    throw new ApiError(
      'Clé Twelve Data manquante. Renseigne-la dans Réglages ou dans .env (VITE_TWELVE_DATA_API_KEY).',
      401,
      'Twelve Data',
    );
  }
  return key;
}

interface TimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface TimeSeriesResponse {
  meta?: { symbol: string; interval: string };
  values?: TimeSeriesValue[];
  status?: 'ok' | 'error';
  code?: number;
  message?: string;
}

const INTERVAL_MAP: Record<'D' | 'W' | 'M', string> = {
  D: '1day',
  W: '1week',
  M: '1month',
};

/**
 * Returns OHLC in the same shape Finnhub used, so the rest of the codebase
 * (indicators, scoring, sparkline) doesn't need to change.
 *
 * Twelve Data returns values most-recent-first; we reverse to chronological order.
 */
export const twelvedata = {
  candles: async (
    symbol: string,
    resolution: 'D' | 'W' | 'M',
    lookbackDays: number,
  ): Promise<Candle> => {
    const apikey = requireKey();
    const interval = INTERVAL_MAP[resolution];
    const outputsize = Math.min(
      5000,
      resolution === 'D'
        ? lookbackDays
        : resolution === 'W'
        ? Math.ceil(lookbackDays / 7)
        : Math.ceil(lookbackDays / 30),
    );

    const res = await getClient().get<TimeSeriesResponse>('/time_series', {
      params: { symbol, interval, outputsize, apikey, order: 'ASC' },
    });

    const data = res.data;
    if (data.status === 'error') {
      throw new ApiError(data.message ?? 'Erreur Twelve Data', data.code, 'Twelve Data');
    }
    if (!data.values || data.values.length === 0) {
      return { c: [], h: [], l: [], o: [], t: [], v: [], s: 'no_data' };
    }

    const c: number[] = [];
    const h: number[] = [];
    const l: number[] = [];
    const o: number[] = [];
    const t: number[] = [];
    const v: number[] = [];

    for (const row of data.values) {
      c.push(Number(row.close));
      h.push(Number(row.high));
      l.push(Number(row.low));
      o.push(Number(row.open));
      v.push(Number(row.volume));
      t.push(Math.floor(new Date(row.datetime).getTime() / 1000));
    }

    return { c, h, l, o, t, v, s: 'ok' };
  },
};
