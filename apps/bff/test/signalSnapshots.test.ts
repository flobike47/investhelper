import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { USER_A, USER_B, createSupabaseFake } from './helpers.js';
import type { SignalDetail } from '../src/signals.js';

const { fake } = vi.hoisted(() => ({ fake: {} as ReturnType<typeof createSupabaseFake> }));

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/supabaseAdmin.js', async () => {
  const { createSupabaseFake } = await import('./helpers.js');
  Object.assign(fake, createSupabaseFake());
  return { supabaseAdmin: fake };
});

const { runSignalSnapshotsTick, BENCHMARK } = await import('../src/jobs/signalSnapshots.js');
const { redis } = await import('../src/cache.js');
const { UNIVERSE } = await import('../src/universe.js');

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;
// Lundi 26/10/2026 (heure d'hiver : Paris = UTC+1)
const MONDAY_2245 = new Date('2026-10-26T21:45:00Z');
const MONDAY_2200 = new Date('2026-10-26T21:00:00Z');
const SATURDAY_2245 = new Date('2026-10-24T20:45:00Z');

const money = (v: number | null) => ({ native: v, eur: v });
function detail(symbol: string, price: number | null = 100): SignalDetail {
  return {
    symbol,
    currency: 'USD',
    price: money(price),
    score: 40,
    signal: 'buy',
    levels: { entry: money(98), stop: money(94), target: money(106), riskReward: 2, unfavorable: false, stopApplies: true },
  } as unknown as SignalDetail;
}

beforeEach(async () => {
  await redis.flushall();
  fake.seed({ signal_snapshots: [], watchlist: [{ user_id: USER_A, ticker: 'BP.L' }, { user_id: USER_B, ticker: 'AAPL' }] });
});

describe('runSignalSnapshotsTick', () => {
  it("n'enregistre rien avant 22:30 à Paris", async () => {
    const compute = vi.fn(async (s: string) => detail(s));
    await runSignalSnapshotsTick(log, MONDAY_2200, compute);
    expect(compute).not.toHaveBeenCalled();
  });

  it("n'enregistre rien le week-end (pas de séance)", async () => {
    const compute = vi.fn(async (s: string) => detail(s));
    await runSignalSnapshotsTick(log, SATURDAY_2245, compute);
    expect(compute).not.toHaveBeenCalled();
  });

  it('enregistre univers + watchlists + repère, pour les trois horizons, repère en dernier', async () => {
    const compute = vi.fn(async (s: string) => detail(s));
    await runSignalSnapshotsTick(log, MONDAY_2245, compute);
    const rows = fake.rows('signal_snapshots');
    const symbols = new Set(rows.map((r) => r.symbol));
    expect(symbols.has('BP.L')).toBe(true); // venu d'une watchlist, hors univers
    expect(symbols.has(BENCHMARK)).toBe(true);
    expect(symbols.size).toBe(new Set([...UNIVERSE.map((u) => u.symbol), 'BP.L', BENCHMARK]).size);
    expect(new Set(rows.map((r) => r.horizon))).toEqual(new Set(['short', 'medium', 'long']));
    expect(rows[0]).toMatchObject({ day: '2026-10-26', price: 100, signal: 'buy', entry: 98, stop: 94, target: 106 });
    expect(rows.at(-1)).toMatchObject({ symbol: BENCHMARK, horizon: 'long' });
    expect(rows.some((r) => 'user_id' in r)).toBe(false); // aucune donnée personnelle
  });

  it('ignore un symbole sans cours ou en erreur sans interrompre la journée', async () => {
    const compute = vi.fn(async (s: string) => {
      if (s === 'AAPL') throw new Error('Twelve Data 429');
      return detail(s, s === 'MSFT' ? null : 100);
    });
    await runSignalSnapshotsTick(log, MONDAY_2245, compute);
    const symbols = new Set(fake.rows('signal_snapshots').map((r) => r.symbol));
    expect(symbols.has('AAPL')).toBe(false);
    expect(symbols.has('MSFT')).toBe(false);
    expect(symbols.has(BENCHMARK)).toBe(true);
  });

  it("ne recalcule pas une journée déjà complète", async () => {
    const compute = vi.fn(async (s: string) => detail(s));
    await runSignalSnapshotsTick(log, MONDAY_2245, compute);
    await redis.flushall();
    compute.mockClear();
    await runSignalSnapshotsTick(log, new Date(MONDAY_2245.getTime() + 15 * 60_000), compute);
    expect(compute).not.toHaveBeenCalled();
  });
});
