/**
 * Helpers de validation pour borner les entrées des routes API.
 * Toutes les valeurs hors bornes sont coupées en silence (clamp) plutôt
 * que rejetées : c'est plus tolérant pour les clients et ça évite les
 * 400 à répétition tout en empêchant les abus de cache.
 */

export class BadRequest extends Error {
  statusCode = 400;
  constructor(message: string) { super(message); }
}

/** Valide un symbole boursier : 1-20 caractères, [A-Z0-9.-] uniquement. */
const SYMBOL_RE = /^[A-Z0-9.\-]{1,20}$/i;
export function validateSymbol(symbol: string): string {
  const s = (symbol ?? '').trim().toUpperCase();
  if (!SYMBOL_RE.test(s)) {
    throw new BadRequest('Symbole invalide');
  }
  return s;
}

/** Limite la longueur d'une chaîne libre. Lève si trop long. */
export function validateString(input: string, name: string, max: number, min = 1): string {
  const s = String(input ?? '').trim();
  if (s.length < min) throw new BadRequest(`${name} requis (min ${min} car.)`);
  if (s.length > max) throw new BadRequest(`${name} trop long (max ${max} car.)`);
  return s;
}

/** Borne un entier. Retourne fallback si NaN. */
export function clampInt(input: unknown, fallback: number, min: number, max: number): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Valide qu'une string est dans un set d'allowlist. */
export function validateEnum<T extends string>(input: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof input === 'string' && (allowed as readonly string[]).includes(input)) {
    return input as T;
  }
  return fallback;
}

/** Coupe un tableau à une taille max. */
export function clampArray<T>(arr: T[], max: number): T[] {
  return arr.slice(0, max);
}
