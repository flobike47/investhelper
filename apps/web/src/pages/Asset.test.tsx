import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/hooks/test-utils';
import AssetRoute from './Asset';

// La fiche elle-même n'est pas testée ici : seulement l'aiguillage de la route.
vi.mock('@/components/stocks/AssetDetail', () => ({
  AssetDetail: ({ symbol }: { symbol: string }) => <p>Fiche {symbol}</p>,
}));

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Liste</p>}>
          <Route path="asset/:symbol" element={<AssetRoute />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AssetRoute', () => {
  it('ouvre la fiche du symbole, normalisé en majuscules', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/asset/mc.pa']}>
        <Routes>
          <Route path="/asset/:symbol" element={<AssetRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Fiche MC.PA')).toBeInTheDocument();
  });

  it('refuse un symbole forgé et revient à la liste, sans requête', () => {
    renderAt('/asset/%3Cscript%3E');
    expect(screen.queryByText(/^Fiche/)).not.toBeInTheDocument();
    expect(screen.getByText('Liste')).toBeInTheDocument();
  });
});
