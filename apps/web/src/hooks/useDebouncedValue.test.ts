import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renvoie la valeur initiale immédiatement', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 250));
    expect(result.current).toBe('a');
  });

  it("n'émet que la dernière valeur d'une rafale, après le délai", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: 'A' },
    });

    rerender({ v: 'AP' });
    act(() => vi.advanceTimersByTime(100));
    rerender({ v: 'APP' });
    act(() => vi.advanceTimersByTime(200));
    // 300 ms depuis « AP » mais seulement 200 ms depuis « APP » : rien d'émis
    expect(result.current).toBe('A');

    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe('APP');
  });

  it('annule le minuteur en attente au démontage', () => {
    const { rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: 'A' },
    });
    rerender({ v: 'B' });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
