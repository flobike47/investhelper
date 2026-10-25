import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import { api } from '@/services/api';
import type { TrackRecord, TrackWindowStats } from '@/types/signals';
import { SignalTrackRecord } from './SignalTrackRecord';

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: { trackRecord: vi.fn() } };
});

const empty: TrackWindowStats = { n: 0, medianReturn: null, medianExcess: null, significant: false };
const windows = (s: TrackWindowStats) => ({ '1m': s, '3m': empty, '12m': empty });
const record = (buy: TrackWindowStats): TrackRecord => ({
  horizon: 'medium',
  benchmark: 'SPY',
  since: '2026-10-26',
  bySignal: { buy: windows(buy), hold: windows(empty), sell: windows(empty) },
});

describe('SignalTrackRecord', () => {
  it("dit qu'il manque du recul au lieu d'afficher un chiffre fragile", async () => {
    vi.mocked(api.trackRecord).mockResolvedValue(record({ n: 3, medianReturn: 0.2, medianExcess: 0.1, significant: false }));
    renderPage(<SignalTrackRecord horizon="medium" />);
    expect(await screen.findByText(/Pas encore assez de recul/)).toBeInTheDocument();
    expect(screen.queryByText(/\+20,0/)).not.toBeInTheDocument();
  });

  it('affiche le rendement médian et l’écart avec le repère quand l’échantillon suffit', async () => {
    vi.mocked(api.trackRecord).mockResolvedValue(record({ n: 12, medianReturn: 0.031, medianExcess: 0.012, significant: true }));
    renderPage(<SignalTrackRecord horizon="medium" />);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText(/^\+3,1\s%$/)).toBeInTheDocument();
    expect(screen.getByText(/\+1,2\s% vs SPY · 12 cas/)).toBeInTheDocument();
  });
});
