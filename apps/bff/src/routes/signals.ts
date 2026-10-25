import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { computeRows, computeSignal, type SignalDetail } from '../signals.js';
import type { Horizon } from '../finance/horizons.js';
import { positionSize, type PositionSize } from '../finance/positionSize.js';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
import { BadRequest, validateSymbol } from '../validation.js';

const HORIZON_IDS: readonly Horizon[] = ['short', 'medium', 'long'];
/** Taille max d'un lot : borne la charge sur les providers (la watchlist web découpe au-delà). */
export const MAX_BATCH_SYMBOLS = 30;

/** Fiche + taille de position propre à l'utilisateur (jamais mise en cache). */
export interface SignalDetailForUser extends SignalDetail {
  /** L'utilisateur a renseigné son capital dans les réglages. */
  capitalSet: boolean;
  riskPerTradePct: number;
  /** null sans capital, sans stop (long terme) ou sans montant en euros. */
  sizing: PositionSize | null;
}

const DEFAULT_RISK_PCT = 1;

async function withSizing(detail: SignalDetail, userId: string): Promise<SignalDetailForUser> {
  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('capital_eur, risk_per_trade_pct')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const capitalEur = data?.capital_eur != null ? Number(data.capital_eur) : null;
  const riskPerTradePct = data?.risk_per_trade_pct != null ? Number(data.risk_per_trade_pct) : DEFAULT_RISK_PCT;
  return {
    ...detail,
    capitalSet: capitalEur !== null,
    riskPerTradePct,
    sizing: positionSize({
      capitalEur,
      riskPct: riskPerTradePct,
      entryEur: detail.levels.entry.eur,
      stopEur: detail.levels.stop.eur,
    }),
  };
}

export function parseHorizon(input: unknown): Horizon {
  if (input === undefined) return 'medium';
  if (typeof input === 'string' && (HORIZON_IDS as readonly string[]).includes(input)) return input as Horizon;
  throw new BadRequest('horizon invalide (short, medium ou long)');
}

export async function registerSignalRoutes(app: FastifyInstance) {
  app.get<{ Params: { symbol: string }; Querystring: { horizon?: string } }>('/signals/:symbol', async (req) => {
    const user = requireUser(req);
    const symbol = validateSymbol(req.params.symbol);
    // Partie commune (données mises en cache) puis taille de position de l'utilisateur.
    const detail = await computeSignal(symbol, parseHorizon(req.query.horizon), req.log);
    return withSizing(detail, user.id);
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
