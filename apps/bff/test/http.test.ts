import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ProviderError, createProviderClient } from '../src/providers/http.js';

// Serveur local : /hang ne répond jamais, /boom renvoie 503.
let server: http.Server;
let baseURL: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/boom') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'service down' }));
    }
    if (req.url === '/google') {
      // Format d'erreur des API Google (Gemini) : `error` est un objet
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: { code: 400, message: 'Model tried to generate text', status: 'INVALID_ARGUMENT' },
      }));
    }
    // /hang : pas de réponse
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('createProviderClient', () => {
  it('abandonne un provider qui ne répond pas et renvoie une ProviderError 504', async () => {
    const client = createProviderClient(baseURL, 'Lent', 50);
    const err = await client.get('/hang').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ status: 504, provider: 'Lent' });
  });

  it('propage le statut et le message amont', async () => {
    const client = createProviderClient(baseURL, 'Down', 1000);
    const err = await client.get('/boom').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 503, provider: 'Down', message: 'service down' });
  });

  it("lit le message d'une erreur au format Google ({ error: { message } })", async () => {
    const client = createProviderClient(baseURL, 'Gemini', 1000);
    const err = await client.get('/google').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, message: 'Model tried to generate text' });
  });

  it('renvoie 502 quand le provider est injoignable', async () => {
    const client = createProviderClient('http://127.0.0.1:1', 'Absent', 1000);
    const err = await client.get('/').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502 });
  });
});
