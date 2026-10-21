import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useObjectUrl } from './useObjectUrl';

// jsdom n'implémente pas createObjectURL / revokeObjectURL
const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

describe('useObjectUrl', () => {
  let n = 0;
  const create = vi.fn(() => `blob:${++n}`);
  const revoke = vi.fn();

  beforeEach(() => {
    n = 0;
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  });
  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  it("révoque l'ancienne URL au remplacement, à la remise à null et au démontage", () => {
    const { result, unmount } = renderHook(() => useObjectUrl());
    act(() => result.current[1](new Blob(['a'])));
    expect(result.current[0]).toBe('blob:1');

    act(() => result.current[1](new Blob(['b'])));
    expect(revoke).toHaveBeenCalledWith('blob:1');
    expect(result.current[0]).toBe('blob:2');

    act(() => result.current[1](null));
    expect(revoke).toHaveBeenCalledWith('blob:2');
    expect(result.current[0]).toBeNull();

    act(() => result.current[1](new Blob(['c'])));
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:3');
  });

  it("ne crée pas d'URL si la synthèse se termine après le démontage", () => {
    const { result, unmount } = renderHook(() => useObjectUrl());
    const setBlob = result.current[1];
    unmount();
    setBlob(new Blob(['tardif']));
    expect(create).not.toHaveBeenCalled();
  });
});
