import type { FastifyBaseLogger } from 'fastify';
import { redis } from '../cache.js';
import { isTimePassed, localParts } from '../localTime.js';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
import { computeSignal, type SignalDetail } from '../signals.js';
import type { Horizon } from '../finance/horizons.js';
import { UNIVERSE } from '../universe.js';

/**
 * Instantané quotidien des signaux (table signal_snapshots), pour mesurer
 * leur performance réelle (/api/signals/track-record).
 *
 * Toutes les 15 minutes, le job vérifie s'il est passé 22:30 à Paris (après
 * la clôture américaine) un jour de semaine, et si l'instantané du jour
 * n'existe pas encore. Le repère est enregistré en dernier, horizon long en
 * dernier : sa présence signifie que la journée est complète.
 */

const TICK_MS = 15 * 60_000;
const TIME_ZONE = 'Europe/Paris';
const RUN_AT = '22:30';
/** Verrou court : si le passage s'interrompt, il reprend 2 h plus tard (insertions idempotentes). */
const LOCK_TTL_SEC = 2 * 60 * 60;
export const BENCHMARK = 'SPY';
const HORIZONS: Horizon[] = ['short', 'medium', 'long'];

type Compute = (symbol: string, horizon: Horizon, log?: FastifyBaseLogger) => Promise<SignalDetail>;

function toRow(d: SignalDetail, horizon: Horizon, day: string) {
  return {
    symbol: d.symbol,
    horizon,
    day,
    price: d.price.native,
    currency: d.currency,
    score: d.score,
    signal: d.signal,
    entry: d.levels.entry.native,
    stop: d.levels.stop.native,
    target: d.levels.target.native,
  };
}

/** Un passage du job. Exporté pour les tests (`now` et le calcul injectés). */
export async function runSignalSnapshotsTick(log: FastifyBaseLogger, now = new Date(), compute: Compute = computeSignal): Promise<void> {
  if (!isTimePassed(now, TIME_ZONE, RUN_AT)) return;
  const day = localParts(now, TIME_ZONE).date;
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return; // pas de séance

  const { data: done, error: doneError } = await supabaseAdmin
    .from('signal_snapshots')
    .select('symbol')
    .eq('day', day)
    .eq('horizon', 'long')
    .eq('symbol', BENCHMARK)
    .limit(1);
  if (doneError) throw doneError;
  if (done?.length) return;

  try {
    const locked = await redis.set(`lock:signal-snapshots:${day}`, '1', 'EX', LOCK_TTL_SEC, 'NX');
    if (locked === null) return;
  } catch {
    /* Redis down : insertions idempotentes, au pire un recalcul */
  }

  // Lecture volontairement globale (toutes les watchlists) : seuls les
  // symboles sont gardés, aucune donnée liée à un utilisateur n'est stockée.
  const { data: watched, error: wlError } = await supabaseAdmin.from('watchlist').select('ticker');
  if (wlError) throw wlError;
  const symbols = [
    ...new Set([...UNIVERSE.map((u) => u.symbol), ...(watched ?? []).map((r) => String(r.ticker).toUpperCase())]),
  ].filter((s) => s !== BENCHMARK);
  symbols.push(BENCHMARK);

  for (const horizon of HORIZONS) {
    const rows: ReturnType<typeof toRow>[] = [];
    // Séquentiel : ménage les quotas des providers (Twelve Data 8 req/min en gratuit).
    for (const symbol of symbols) {
      try {
        const d = await compute(symbol, horizon, log);
        if (d.price.native !== null && d.price.native > 0) rows.push(toRow(d, horizon, day));
      } catch (err) {
        log.warn({ err, symbol, horizon }, 'instantané des signaux : symbole ignoré');
      }
    }
    const { error } = await supabaseAdmin
      .from('signal_snapshots')
      .upsert(rows, { onConflict: 'symbol,horizon,day', ignoreDuplicates: true });
    if (error) throw error;
    log.info({ day, horizon, saved: rows.length, total: symbols.length }, 'instantané des signaux enregistré');
  }
}

/** Démarre le job ; renvoie la fonction d'arrêt (appelée au SIGTERM). */
export function startSignalSnapshots(log: FastifyBaseLogger): () => void {
  let running = false;
  const timer = setInterval(() => {
    // Un passage complet dure plusieurs minutes : pas de passages superposés
    if (running) return;
    running = true;
    runSignalSnapshotsTick(log)
      .catch((err) => log.error({ err }, 'instantané des signaux : passage échoué'))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  return () => clearInterval(timer);
}
