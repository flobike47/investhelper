import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StockRow } from './StockRow';
import type { AnalyzedTicker } from '@/hooks/useStockData';

// Pas de réseau : les hooks de données sont remplacés par des valeurs vides.
vi.mock('@/hooks/useStockData', () => ({
  useCandles: () => ({ data: undefined }),
}));
vi.mock('@/hooks/useFx', () => ({
  useFxRates: () => ({ data: { USD: 1.1 } }),
}));

beforeAll(() => {
  // jsdom n'implémente pas matchMedia, utilisé par la grille responsive d'antd.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(cleanup);

function ticker(partial: Partial<AnalyzedTicker>): AnalyzedTicker {
  return {
    symbol: 'AAPL',
    loading: false,
    error: null,
    price: null,
    changePct: null,
    score: null,
    ...partial,
  };
}

describe('StockRow', () => {
  it('affiche le message de l’erreur quand aucune donnée n’est disponible', () => {
    const error = Object.assign(new Error('Symbole inconnu'), { reqId: 'r-42' });
    render(<StockRow data={ticker({ error })} horizon="medium" />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText(/Données indisponibles : Symbole inconnu \(réf\. r-42\)/)).toBeInTheDocument();
    // Pas de prix « — » ni de graphique trompeur à côté de l'erreur
    expect(screen.queryByText('Entrée')).not.toBeInTheDocument();
  });

  it('signale des données partielles sans masquer le prix', () => {
    render(
      <StockRow
        data={ticker({ error: new Error('Recommandations indisponibles'), price: 110, changePct: 1.5 })}
        horizon="medium"
      />,
    );

    expect(screen.getByText(/Données partielles : Recommandations indisponibles/)).toBeInTheDocument();
    expect(screen.getByText(/\+1,50/)).toBeInTheDocument();
  });

  it('n’affiche aucun message d’erreur quand tout va bien', () => {
    render(<StockRow data={ticker({ price: 110, changePct: -0.4 })} horizon="medium" />);
    expect(screen.queryByText(/Données (indisponibles|partielles)/)).not.toBeInTheDocument();
  });
});
