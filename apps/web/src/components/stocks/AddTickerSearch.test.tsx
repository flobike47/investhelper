import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
import { AddTickerSearch } from './AddTickerSearch';

const m = vi.hoisted(() => ({
  tickers: ['AAPL'] as string[],
  addAsync: vi.fn<(t: string) => Promise<unknown>>(),
}));

vi.mock('@/hooks/useWatchlist', () => ({ useWatchlist: () => ({ tickers: m.tickers, addAsync: m.addAsync }) }));
vi.mock('@/hooks/useSymbolSearch', () => ({ useSymbolSearch: () => ({ results: [], searching: false }) }));

const field = () => screen.getByRole('combobox', { name: 'Ajouter un actif à la watchlist' });
const submit = (value: string) => {
  fireEvent.change(field(), { target: { value } });
  fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter', keyCode: 13 });
};

describe('AddTickerSearch', () => {
  beforeEach(() => m.addAsync.mockReset());

  it("n'annonce l'ajout qu'une fois confirmé par le serveur, en majuscules", async () => {
    let confirm!: () => void;
    m.addAsync.mockReturnValue(new Promise<void>((r) => (confirm = r)));
    renderWithProviders(<AddTickerSearch />);

    submit('mc.pa');
    expect(m.addAsync).toHaveBeenCalledWith('MC.PA');
    expect(screen.queryByText('MC.PA ajouté.')).not.toBeInTheDocument();

    confirm();
    expect(await screen.findByText('MC.PA ajouté.')).toBeInTheDocument();
  });

  it('signale un doublon sans appeler le serveur', async () => {
    renderWithProviders(<AddTickerSearch />);
    submit('aapl');
    expect(m.addAsync).not.toHaveBeenCalled();
    expect(await screen.findByText('AAPL est déjà dans ta watchlist.')).toBeInTheDocument();
  });
});
