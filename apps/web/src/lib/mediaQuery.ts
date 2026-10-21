/**
 * Source externe compatible `useSyncExternalStore` pour une media query :
 * la valeur suit les changements en direct (réglage d'accessibilité modifié
 * pendant que l'app est ouverte). Sans React, donc testable seule.
 */
export interface MediaQueryStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
}

export function createMediaQueryStore(query: string): MediaQueryStore {
  // jsdom et quelques vieux navigateurs n'exposent pas matchMedia.
  const mql = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query)
      : null;

  return {
    subscribe(onChange) {
      const list = mql();
      if (!list) return () => {};
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    getSnapshot() {
      return mql()?.matches ?? false;
    },
  };
}

export const reducedMotionQuery = createMediaQueryStore('(prefers-reduced-motion: reduce)');
