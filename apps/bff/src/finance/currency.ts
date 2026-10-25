/**
 * Conversion vers l'euro et formatage des montants cités dans les textes du
 * playbook. Les taux viennent de providers/fx.ts : `rates[X]` = combien de X
 * pour 1 EUR.
 */

/**
 * @returns le montant en EUR, ou null si le taux manque — jamais le montant
 *          natif présenté comme des euros.
 */
export function convertToEur(
  amount: number | null | undefined,
  currency: string,
  rates: Record<string, number> | null | undefined,
): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  if (currency === 'EUR') return amount;
  const rate = rates?.[currency];
  if (!rate) return null;
  return amount / rate;
}

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEur(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  return eurFormatter.format(amount);
}
