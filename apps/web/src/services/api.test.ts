import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { ApiError, toApiError } from './api';

function httpError(status: number, data: unknown) {
  const response = { status, data, headers: {}, statusText: '', config: { headers: new AxiosHeaders() } };
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, response as AxiosResponse);
}

describe('toApiError', () => {
  it('expose le message et le reqId renvoyés par le BFF', () => {
    const e = toApiError(httpError(429, { error: 'Quota dépassé', reqId: 'abc' }));
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ message: 'Quota dépassé', status: 429, reqId: 'abc' });
  });

  it('décode un corps d’erreur binaire (réponses TTS en arraybuffer)', () => {
    const buf = new TextEncoder().encode(JSON.stringify({ error: 'lien expiré', reqId: 'r1' })).buffer;
    expect(toApiError(httpError(410, buf))).toMatchObject({ message: 'lien expiré', status: 410 });
  });

  it('donne un message clair sur timeout et serveur injoignable', () => {
    expect(toApiError(new AxiosError('timeout', 'ECONNABORTED')).message).toMatch(/trop de temps/);
    expect(toApiError(new AxiosError('Network Error', 'ERR_NETWORK')).message).toMatch(/injoignable/);
  });

  it('retombe sur le code HTTP quand le corps n’est pas exploitable', () => {
    expect(toApiError(httpError(502, '<html>')).message).toBe('Erreur 502');
  });
});
