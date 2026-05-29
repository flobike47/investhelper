import axios from 'axios';
import { httpsAgent } from './http.js';

const FX_URL = 'https://open.er-api.com/v6/latest/EUR';

interface OpenErApi {
  result: 'success' | 'error';
  base_code: string;
  rates: Record<string, number>;
  'error-type'?: string;
}

export const fx = {
  ratesToEur: async (): Promise<Record<string, number>> => {
    const res = await axios.get<OpenErApi>(FX_URL, { timeout: 0, httpsAgent });
    if (res.data.result !== 'success') {
      throw new Error(res.data['error-type'] ?? 'Erreur taux de change');
    }
    return res.data.rates;
  },
};
