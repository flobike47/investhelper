import { useSyncExternalStore } from 'react';
import { reducedMotionQuery } from '@/lib/mediaQuery';

/**
 * `true` quand l'utilisateur a demandé « Réduire les animations » dans son
 * OS. Se met à jour sans rechargement si le réglage change.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    reducedMotionQuery.subscribe,
    reducedMotionQuery.getSnapshot,
    () => false,
  );
}
