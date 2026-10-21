import { useEffect, useState } from 'react';

/**
 * Renvoie `value` après `delayMs` sans changement. Chaque nouvelle valeur
 * relance le délai : seule la dernière valeur d'une rafale est émise.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
