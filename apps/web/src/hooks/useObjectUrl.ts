import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Gère le cycle de vie d'une ObjectURL : l'ancienne est révoquée à chaque
 * remplacement, à la remise à `null` et au démontage — pas de fuite mémoire
 * même si l'utilisateur régénère l'audio plusieurs fois.
 */
export function useObjectUrl(): [string | null, (blob: Blob | null) => void] {
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const setBlob = useCallback((blob: Blob | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    // Démonté (ex. synthèse terminée après fermeture du lecteur) : on ne crée rien
    const next = blob && mountedRef.current ? URL.createObjectURL(blob) : null;
    urlRef.current = next;
    if (mountedRef.current) setUrl(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  return [url, setBlob];
}
