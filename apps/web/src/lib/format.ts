/**
 * Formatage d'affichage des nombres (locale fr-FR). On n'arrondit qu'ici,
 * jamais au milieu d'un calcul.
 */

const signedPctFormatters = new Map<number, Intl.NumberFormat>();

function signedPctFormatter(digits: number): Intl.NumberFormat {
  let fmt = signedPctFormatters.get(digits);
  if (!fmt) {
    fmt = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: 'exceptZero',
    });
    signedPctFormatters.set(digits, fmt);
  }
  return fmt;
}

/**
 * Variation en pourcentage (valeur 0-100, pas un ratio) avec signe explicite :
 * `1.234` → `+1,23 %`, `-0.5` → `-0,50 %`, `0` → `0,00 %`.
 * Le signe rend le sens lisible sans dépendre de la couleur.
 * Renvoie `—` pour une valeur absente ou non finie.
 */
export function formatSignedPct(pct: number | null | undefined, digits = 2): string {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return '—';
  // Intl peut produire « -0,00 » pour -0.001 : on normalise ce cas en zéro neutre.
  const rounded = Number(pct.toFixed(digits));
  const value = Object.is(rounded, -0) ? 0 : rounded;
  // Espace insécable fine avant % (typographie française, comme Intl en style percent).
  return `${signedPctFormatter(digits).format(value)}\u202f%`;
}
