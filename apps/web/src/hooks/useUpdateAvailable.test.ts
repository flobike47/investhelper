import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useUpdateAvailable } from './useUpdateAvailable';

const fetchMock = vi.fn();
let visibility: DocumentVisibilityState = 'visible';

function comeBack(afterMs: number) {
  act(() => {
    vi.advanceTimersByTime(afterMs);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const deployed = (build: string) => fetchMock.mockResolvedValue({ ok: true, json: async () => ({ build }) });

describe('useUpdateAvailable', () => {
  it("signale une mise en prod au retour sur l'app", async () => {
    deployed('un-autre-build');
    const { result } = renderHook(() => useUpdateAvailable(true));
    comeBack(6 * 60_000);
    await act(async () => {});
    expect(result.current).toBe(true);
  });

  it('ne signale rien quand la version en ligne est celle qui tourne', async () => {
    deployed(__BUILD_ID__);
    const { result } = renderHook(() => useUpdateAvailable(true));
    comeBack(6 * 60_000);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it('ne vérifie pas plus d\'une fois toutes les 5 minutes', () => {
    deployed(__BUILD_ID__);
    renderHook(() => useUpdateAvailable(true));
    comeBack(60_000); // 1 min après le chargement : trop tôt
    expect(fetchMock).not.toHaveBeenCalled();
    comeBack(5 * 60_000);
    comeBack(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ne vérifie pas quand l'app passe en arrière-plan", () => {
    deployed('un-autre-build');
    renderHook(() => useUpdateAvailable(true));
    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ne fait rien hors build de prod', () => {
    renderHook(() => useUpdateAvailable(false));
    comeBack(6 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
