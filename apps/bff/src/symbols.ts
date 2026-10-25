/**
 * Suffixes de place au format Yahoo / Twelve Data (MC.PA, SAP.DE, BP.L…).
 * Un symbole sans l'un de ces suffixes est coté aux États-Unis, y compris les
 * classes d'actions (BRK.B, BF.B) dont le point n'indique pas une place.
 */
export const EXCHANGE_SUFFIXES = [
  '.PA', '.AS', '.DE', '.F', '.MI', '.MC', '.LS', '.BR', '.VI', '.HE', '.IR',
  '.ST', '.CO', '.OL', '.WA', '.PR', '.AT', '.IS',
  '.L', '.SW',
  '.T', '.TYO', '.HK', '.SS', '.SZ', '.KS', '.KQ', '.TW', '.SI', '.NS', '.BO',
  '.TO', '.V', '.NE', '.AX', '.NZ', '.SA', '.MX', '.JO', '.TA',
] as const;

export function exchangeSuffix(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  return EXCHANGE_SUFFIXES.find((s) => upper.endsWith(s)) ?? null;
}

/** Coté aux États-Unis : Finnhub (cours) et Twelve Data (bougies) le couvrent en plan gratuit. */
export function isUsListed(symbol: string): boolean {
  return exchangeSuffix(symbol) === null;
}

/** Syntaxe Yahoo : les classes d'actions US s'écrivent BRK-B, le reste est identique. */
export function toYahooSymbol(symbol: string): string {
  return isUsListed(symbol) ? symbol.replace(/^([A-Z]+)\.([A-Z])$/, '$1-$2') : symbol;
}
