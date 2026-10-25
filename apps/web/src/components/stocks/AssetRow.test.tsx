import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import { ApiError } from '@/services/api';
import type { TickerView } from '@/hooks/useSignals';
import { AssetRow } from './AssetRow';

const base: TickerView = {
  symbol: 'NVDA',
  name: 'NVIDIA', // nom fourni par le BFF
  loading: false,
  error: null,
  currency: 'USD',
  price: { native: 110, eur: 100 }, // conversion faite par le BFF
  changePct: 2.314,
  score: null,
  signal: 'unknown',
  closes: [],
};

describe('AssetRow', () => {
  it('affiche cours converti en €, variation signée et nom, et pointe vers la fiche', () => {
    renderPage(<AssetRow data={base} to="/asset/NVDA" />);
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
        to="/asset/NVDA"
      />,
    );
    expect(screen.getByText('Données indisponibles')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAccessibleName(/données indisponibles/);
  });
});
