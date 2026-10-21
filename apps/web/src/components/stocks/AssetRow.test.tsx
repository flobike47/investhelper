import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import { ApiError } from '@/services/api';
import type { AnalyzedTicker } from '@/hooks/useStockData';
import { AssetRow } from './AssetRow';

vi.mock('@/hooks/useStockData', () => ({ useCandles: () => ({ data: undefined }) }));
vi.mock('@/hooks/useFx', () => ({ useFxRates: () => ({ data: { USD: 1.1 } }) }));

const base: AnalyzedTicker = { symbol: 'NVDA', loading: false, error: null, price: 110, changePct: 2.314, score: null };

describe('AssetRow', () => {
  it('affiche cours converti en €, variation signée et nom, et pointe vers la fiche', () => {
    renderPage(<AssetRow data={base} horizon="medium" to="/asset/NVDA" />);
    const link = screen.getByRole('link', { name: /NVDA/ });
    expect(link).toHaveAttribute('href', '/asset/NVDA');
    expect(screen.getByText(/100,00\s€/)).toBeInTheDocument();
    expect(screen.getByText(/^\+2,31\s%$/)).toBeInTheDocument();
    expect(screen.getByText('NVIDIA')).toBeInTheDocument();
  });

  it("signale des données indisponibles au lieu d'un prix inventé", () => {
    renderPage(
      <AssetRow
        data={{ ...base, price: null, changePct: null, error: new ApiError('Finnhub : délai dépassé', 504, 'r1') }}
        horizon="medium"
        to="/asset/NVDA"
      />,
    );
    expect(screen.getByText('Données indisponibles')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAccessibleName(/données indisponibles/);
  });
});
