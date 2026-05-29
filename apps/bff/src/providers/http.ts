import axios, { type AxiosInstance, type AxiosError } from 'axios';
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';

// Préfère IPv4 pour la résolution DNS — sur certains réseaux (Pi à la maison
// derrière une box) le fallback IPv6 → IPv4 ajoute 2-5s de latence par appel.
dns.setDefaultResultOrder('ipv4first');

// Agents partagés entre tous les clients HTTP du BFF.
//  - keepAlive: réutilise les sockets TCP+TLS → économise ~200-500ms par appel
//    après le premier (TLS handshake évité)
//  - maxSockets: cap pour ne pas saturer (Finnhub free = 60 rpm donc 20 suffit)
//  - keepAliveMsecs: idle avant fermeture
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 20,
  maxFreeSockets: 10,
});
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 20,
  maxFreeSockets: 10,
});

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public provider: string,
  ) {
    super(message);
  }
}

export function createProviderClient(baseURL: string, provider: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 0,
    httpsAgent,
    httpAgent,
  });
  client.interceptors.response.use(
    (r) => r,
    (err: AxiosError<{ error?: string; message?: string }>) => {
      const status = err.response?.status ?? 500;
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Erreur réseau';
      return Promise.reject(new ProviderError(msg, status, provider));
    },
  );
  return client;
}

/** Wrapper qui swallow les 401/403 et renvoie null — utile pour les providers
 *  qui ont gated des endpoints en premium. */
export async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

/** Agents exportés pour les providers qui font des appels axios directs
 *  (Yahoo, FX) — pour qu'ils profitent aussi du keep-alive. */
export { httpsAgent, httpAgent };
