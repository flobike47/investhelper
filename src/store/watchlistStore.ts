import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'VOO'];

interface WatchlistState {
  tickers: string[];
  add: (ticker: string) => void;
  remove: (ticker: string) => void;
  reset: () => void;
  reorder: (next: string[]) => void;
}

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set, get) => ({
      tickers: DEFAULT_WATCHLIST,
      add: (raw) => {
        const ticker = raw.trim().toUpperCase();
        if (!ticker) return;
        const current = get().tickers;
        if (current.includes(ticker)) return;
        set({ tickers: [...current, ticker] });
      },
      remove: (ticker) =>
        set({ tickers: get().tickers.filter((t) => t !== ticker) }),
      reset: () => set({ tickers: DEFAULT_WATCHLIST }),
      reorder: (next) => set({ tickers: next }),
    }),
    { name: 'investhelper.watchlist' },
  ),
);
