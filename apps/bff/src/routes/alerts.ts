import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { cachedQuote } from '../marketCache.js';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
import { BadRequest, Conflict, NotFound, validateEnum, validateSymbol, validateUuid } from '../validation.js';

/**
 * Alertes de prix : seuil libre, stop ou objectif du plan. Le job
 * jobs/priceAlerts.ts compare les alertes actives au cours et envoie un push.
 */

const DIRECTIONS = ['above', 'below'] as const;
const KINDS = ['price', 'stop', 'target'] as const;
const MAX_THRESHOLD = 1_000_000_000;
const COLUMNS = 'id, symbol, direction, threshold, currency, kind, created_at, triggered_at, triggered_price';

interface AlertRow {
  id: string;
  symbol: string;
  direction: (typeof DIRECTIONS)[number];
  threshold: number | string;
  currency: string;
  kind: (typeof KINDS)[number];
  created_at: string;
  triggered_at: string | null;
  triggered_price: number | string | null;
}

export interface PriceAlertDto {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  /** Seuil dans la devise de cotation. */
  threshold: number;
  currency: string;
  kind: 'price' | 'stop' | 'target';
  createdAt: string;
  triggeredAt: string | null;
  triggeredPrice: number | null;
}

// numeric Postgres : converti explicitement (PostgREST peut renvoyer une chaîne)
const toDto = (r: AlertRow): PriceAlertDto => ({
  id: r.id,
  symbol: r.symbol,
  direction: r.direction,
  threshold: Number(r.threshold),
  currency: r.currency,
  kind: r.kind,
  createdAt: r.created_at,
  triggeredAt: r.triggered_at,
  triggeredPrice: r.triggered_price === null ? null : Number(r.triggered_price),
});

interface CreateBody {
  symbol?: unknown;
  direction?: unknown;
  threshold?: unknown;
  kind?: unknown;
}

export async function registerAlertRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { symbol?: string } }>('/user/alerts', async (req) => {
    const user = requireUser(req);
    let query = supabaseAdmin
      .from('price_alerts')
      .select(COLUMNS)
      .eq('user_id', user.id);
    if (req.query.symbol !== undefined) query = query.eq('symbol', validateSymbol(req.query.symbol));
    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return { alerts: ((data ?? []) as AlertRow[]).map(toDto) };
  });

  app.post<{ Body: CreateBody }>('/user/alerts', async (req, reply) => {
    const user = requireUser(req);
    const body = req.body ?? {};
    const symbol = validateSymbol(String(body.symbol ?? ''));
    if (!DIRECTIONS.includes(body.direction as never)) throw new BadRequest('direction invalide (above ou below)');
    const direction = body.direction as PriceAlertDto['direction'];
    const threshold = body.threshold;
    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0 || threshold > MAX_THRESHOLD) {
      throw new BadRequest('seuil invalide (nombre > 0)');
    }
    const kind = validateEnum(body.kind, KINDS, 'price');

    // Le seuil est comparé au cours dans sa devise : on la fixe à la création,
    // et on refuse une alerte qui serait déjà franchie (envoi immédiat).
    const quote = await cachedQuote(symbol, req.log);
    if (direction === 'above' && quote.c >= threshold) {
      throw new BadRequest(`Le cours (${quote.c} ${quote.currency}) est déjà au-dessus de ce seuil`);
    }
    if (direction === 'below' && quote.c <= threshold) {
      throw new BadRequest(`Le cours (${quote.c} ${quote.currency}) est déjà en dessous de ce seuil`);
    }

    const row = { id: randomUUID(), user_id: user.id, symbol, direction, threshold, currency: quote.currency, kind };
    const { error } = await supabaseAdmin.from('price_alerts').insert(row);
    if (error) {
      // Levée par le trigger price_alerts_enforce_limit (migration 007)
      if (error.code === 'P0001' && error.message.includes('price_alerts_limit')) {
        throw new Conflict('Limite de 50 alertes actives atteinte');
      }
      if (error.code === '23514') throw new BadRequest('Alerte invalide');
      throw error;
    }
    reply.code(201);
    return toDto({ ...row, created_at: new Date().toISOString(), triggered_at: null, triggered_price: null });
  });

  app.delete<{ Params: { id: string } }>('/user/alerts/:id', async (req) => {
    const user = requireUser(req);
    const id = validateUuid(req.params.id);
    const { data, error } = await supabaseAdmin
      .from('price_alerts')
      .delete()
      .eq('user_id', user.id)
      .eq('id', id)
      .select('id');
    if (error) throw error;
    // 404 aussi pour l'alerte d'un autre utilisateur : on ne révèle pas son existence
    if (!data?.length) throw new NotFound('Alerte introuvable');
    return { ok: true };
  });
}
