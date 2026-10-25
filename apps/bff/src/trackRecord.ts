import { cachedJson } from './cache.js';
import { computeTrackRecord, type SnapshotPoint, type TrackRecord } from './finance/trackRecord.js';
import type { Horizon } from './finance/horizons.js';
import { BENCHMARK } from './jobs/signalSnapshots.js';
import { supabaseAdmin } from './providers/supabaseAdmin.js';

/** Recalcul au plus toutes les 6 h : les instantanés ne changent qu'une fois par jour. */
const TRACK_RECORD_TTL = 6 * 60 * 60;
const PAGE = 1000; // limite par défaut de PostgREST

async function loadSnapshots(horizon: Horizon): Promise<SnapshotPoint[]> {
  const points: SnapshotPoint[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('signal_snapshots')
      .select('symbol, day, signal, price')
      .eq('horizon', horizon)
      .order('symbol', { ascending: true })
      .order('day', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    // numeric Postgres : converti explicitement
    for (const r of rows) points.push({ symbol: r.symbol, day: r.day, signal: r.signal, price: Number(r.price) });
    if (rows.length < PAGE) return points;
  }
}

export function getTrackRecord(horizon: Horizon): Promise<TrackRecord & { horizon: Horizon }> {
  return cachedJson(`track:v1:${horizon}`, TRACK_RECORD_TTL, async () => ({
    horizon,
    ...computeTrackRecord(await loadSnapshots(horizon), BENCHMARK),
  }));
}
