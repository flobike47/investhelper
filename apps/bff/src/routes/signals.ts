import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { computeRows, computeSignal } from '../signals.js';
import type { Horizon } from '../finance/horizons.js';
import { BadRequest, validateSymbol } from '../validation.js';

const HORIZON_IDS: readonly Horizon[] = ['short', 'medium', 'long'];
/** Taille max d'un lot : borne la charge sur les providers (la watchlist web découpe au-delà). */
export const MAX_BATCH_SYMBOLS = 30;

function parseHorizon(input: unknown): Horizon {
  if (input === undefined) return 'medium';
  if (typeof input === 'string' && (HORIZON_IDS as readonly string[]).includes(input)) return input as Horizon;
  throw new BadRequest('horizon invalide (short, medium ou long)');
}

export async function registerSignalRoutes(app: FastifyInstance) {
  app.get<{ Params: { symbol: string }; Querystring: { horizon?: string } }>('/signals/:symbol', async (req) => {
    requireUser(req);
    const symbol = validateSymbol(req.params.symbol);
    return computeSignal(symbol, parseHorizon(req.query.horizon), req.log);
  });

  app.get<{ Querystring: { symbols?: string; horizon?: string } }>('/signals', async (req) => {
    requireUser(req);
    const horizon = parseHorizon(req.query.horizon);
    const raw = (req.query.symbols ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (raw.length === 0) throw new BadRequest('symbols requis');
    const symbols = [...new Set(raw.map(validateSymbol))];
    if (symbols.length > MAX_BATCH_SYMBOLS) throw new BadRequest(`${MAX_BATCH_SYMBOLS} symboles au plus par requête`);
    return computeRows(symbols, horizon, req.log);
  });
}
