/**
 * Formatage des montants pour l'affichage. Les conversions sont faites par le
 * BFF, qui renvoie chaque montant en devise native et en euros (`Money`).
 */
import type { Money } from '@/types/signals';

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nativeFormatters = new Map<string, Intl.NumberFormat>();
function getNativeFormatter(currency: string): Intl.NumberFormat {
  let fmt = nativeFormatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    nativeFormatters.set(currency, fmt);
  }
  return fmt;
}

export function formatEur(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  return eurFormatter.format(amount);
}

export function formatNative(
  amount: number | null | undefined,
  currency: string,
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  try {
    return getNativeFormatter(currency).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Montant en euros quand la conversion est disponible, sinon en devise native
 * avec son symbole — jamais un montant non converti étiqueté en euros.
 */
export function formatMoney(m: Money | null | undefined, currency: string | null): string {
  if (m?.eur !== null && m?.eur !== undefined && Number.isFinite(m.eur)) return formatEur(m.eur);
  if (m?.native !== null && m?.native !== undefined && currency) return formatNative(m.native, currency);
  return '—';
}
