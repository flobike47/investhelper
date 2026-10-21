import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
import { ApiError, api } from '@/services/api';
import Watchlist from './Watchlist';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      getWatchlist: vi.fn(),
      addToWatchlist: vi.fn(),
      removeFromWatchlist: vi.fn(),
      search: vi.fn(),
    },
  };
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const searchInput = () => screen.getByRole('combobox', { name: 'Rechercher un ticker' });

describe('Watchlist', () => {
  beforeEach(() => {
    vi.mocked(api.getWatchlist).mockResolvedValue({ tickers: [] });
    vi.mocked(api.search).mockResolvedValue({ count: 0, result: [] });
  });

  it("n'annonce l'ajout qu'après confirmation du serveur", async () => {
    const pending = deferred<{ ok: true }>();
    vi.mocked(api.addToWatchlist).mockReturnValue(pending.promise);
    renderWithProviders(<Watchlist />);
    await screen.findByText(/Aucun ticker/);

    fireEvent.change(searchInput(), { target: { value: 'msft' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));

    // Ajout optimiste visible, mais pas encore de succès annoncé
    expect(await screen.findByText('MSFT')).toBeInTheDocument();
    expect(screen.queryByText('MSFT ajouté.')).not.toBeInTheDocument();

    pending.resolve({ ok: true });
    expect(await screen.findByText('MSFT ajouté.')).toBeInTheDocument();
  });

  it("annule l'ajout optimiste et n'annonce pas de succès en cas d'échec", async () => {
    vi.mocked(api.addToWatchlist).mockRejectedValue(new ApiError('Ticker inconnu', 400, 'r1'));
    renderWithProviders(<Watchlist />);
    await screen.findByText(/Aucun ticker/);

    fireEvent.change(searchInput(), { target: { value: 'ZZZZ' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));

    expect(await screen.findByText('Ticker inconnu')).toBeInTheDocument();
    expect(screen.queryByText('ZZZZ ajouté.')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('ZZZZ')).not.toBeInTheDocument());
  });

  it('debounce la recherche : une seule requête pour une rafale de frappes', async () => {
    renderWithProviders(<Watchlist />);
    await screen.findByText(/Aucun ticker/);

    for (const v of ['A', 'AP', 'APP', 'APPL']) {
      fireEvent.change(searchInput(), { target: { value: v } });
    }

    await waitFor(() => expect(api.search).toHaveBeenCalled());
    // Laisse passer un éventuel second déclenchement avant de compter
    await new Promise((r) => setTimeout(r, 400));
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(api.search).toHaveBeenCalledWith('APPL', expect.any(AbortSignal));
  });

  it('donne un libellé explicite au bouton de suppression', async () => {
    vi.mocked(api.getWatchlist).mockResolvedValue({ tickers: ['AAPL'] });
    renderWithProviders(<Watchlist />);
    expect(await screen.findByRole('button', { name: 'Retirer AAPL de la watchlist' })).toBeInTheDocument();
  });
});
