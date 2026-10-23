import { useEffect, useState } from 'react';
import { fetchDeployedBuild, isNewBuild } from '@/lib/pwa';

/** Pas plus d'une vérification toutes les 5 min, même en changeant souvent d'app. */
const MIN_INTERVAL_MS = 5 * 60_000;

/**
 * Une mise en prod a-t-elle eu lieu depuis le chargement de l'app ?
 * Vérifié au retour au premier plan : sur iPhone, rouvrir une PWA reprend
 * souvent l'app en mémoire, avec l'ancien code. Build de prod seulement.
 */
export function useUpdateAvailable(enabled: boolean = import.meta.env.PROD): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!enabled || available) return;
    let cancelled = false;
    let lastCheck = Date.now(); // le code vient d'être chargé : inutile de vérifier tout de suite

    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < MIN_INTERVAL_MS) return;
      lastCheck = Date.now();
      fetchDeployedBuild().then((deployed) => {
        if (!cancelled && isNewBuild(__BUILD_ID__, deployed)) setAvailable(true);
      });
    };

    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled, available]);

  return available;
}
