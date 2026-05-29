import { config } from '../config.js';
import { createProviderClient, ProviderError } from './http.js';
import type { Candle } from '../types.js';

const client = createProviderClient('https://api.twelvedata.com', 'Twelve Data');

function key() {
  if (!config.twelveDataKey)
    throw new ProviderError('TWELVE_DATA_API_KEY non configurée', 503, 'Twelve Data');
  return config.twelveDataKey;
}

interface TimeSeriesValue {
  datetime: string;
  open: string; high: string; low: string; close: string; volume: string;
}
interface TimeSeriesResponse {
  values?: TimeSeriesValue[];
  status?: 'ok' | 'error';
  code?: number;
  message?: string;
}

const INTERVAL: Record<'D' | 'W' | 'M', string> = { D: '1day', W: '1week', M: '1month' };

export const twelvedata = {
  candles: async (symbol: string, resolution: 'D' | 'W' | 'M', lookbackDays: number): Promise<Candle> => {
    const interval = INTERVAL[resolution];
    const outputsize = Math.min(
      5000,
      resolution === 'D' ? lookbackDays
        : resolution === 'W' ? Math.ceil(lookbackDays / 7)
        : Math.ceil(lookbackDays / 30),
    );

    const res = await client.get<TimeSeriesResponse>('/time_series', {
      params: { symbol, interval, outputsize, apikey: key(), order: 'ASC' },
    });
    const data = res.data;
    if (data.status === 'error') {
      throw new ProviderError(data.message ?? 'Erreur Twelve Data', data.code ?? 500, 'Twelve Data');
    }
    if (!data.values || data.values.length === 0) {
      return { c: [], h: [], l: [], o: [], t: [], v: [], s: 'no_data' };
    }
    const c: number[] = [], h: number[] = [], l: number[] = [], o: number[] = [], t: number[] = [], v: number[] = [];
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
