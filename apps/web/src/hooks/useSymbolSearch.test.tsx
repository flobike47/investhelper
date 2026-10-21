import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { SymbolSearchResult } from '@/types/finnhub';
import { createTestQueryClient } from './test-utils';
import { useSymbolSearch } from './useSymbolSearch';

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: { search: vi.fn() } };
});

const res = (symbol: string): SymbolSearchResult => ({
  count: 1,
  result: [{ symbol, displaySymbol: symbol, description: symbol, type: 'Common Stock' }],
});

describe('useSymbolSearch', () => {
  it("une réponse lente d'une ancienne saisie n'écrase pas la plus récente", async () => {
    let resolveSlow!: (v: SymbolSearchResult) => void;
    vi.mocked(api.search).mockImplementation((q) =>
      q === 'A' ? new Promise((r) => (resolveSlow = r)) : Promise.resolve(res(q)),
    );
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(({ q }) => useSymbolSearch(q), {
      wrapper,
      initialProps: { q: 'A' },
    });
    await waitFor(() => expect(api.search).toHaveBeenCalledWith('A', expect.any(AbortSignal)));

    rerender({ q: 'AP' });
    await waitFor(() => expect(result.current.results[0]?.symbol).toBe('AP'));

    await act(async () => resolveSlow(res('A')));
    expect(result.current.results[0]?.symbol).toBe('AP');
  });

  it("n'interroge pas le serveur pour une saisie vide", async () => {
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSymbolSearch('   '), { wrapper });
    await new Promise((r) => setTimeout(r, 300));
    expect(api.search).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });
});
