/** Cours normalisé renvoyé par le BFF (Finnhub pour les valeurs US, Yahoo ailleurs). */
export interface Quote {
  c: number;           // cours
  dp: number | null;   // variation du jour en %
  t: number;           // horodatage (secondes)
  currency: string;
  source: 'finnhub' | 'yahoo';
}

export interface CompanyProfile {
  country: string;
  currency: string;
  exchange: string;
  name: string;
  ticker: string;
  ipo: string;
  marketCapitalization: number;
  shareOutstanding: number;
  logo: string;
  phone: string;
  weburl: string;
  finnhubIndustry: string;
}

export interface Candle {
  c: number[]; // close
  h: number[]; // high
  l: number[]; // low
  o: number[]; // open
  t: number[]; // timestamp
  v: number[]; // volume
  s: 'ok' | 'no_data';
  currency?: string;
}

export interface RecommendationTrend {
  buy: number;
  hold: number;
  period: string;
  sell: number;
  strongBuy: number;
  strongSell: number;
  symbol: string;
}

export interface PriceTarget {
  lastUpdated: string;
  symbol: string;
  /** null quand le provider ne fournit pas la valeur (jamais 0 par défaut). */
  targetHigh: number | null;
  targetLow: number | null;
  targetMean: number | null;
  targetMedian: number | null;
}

export interface CompanyNewsItem {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export interface SymbolSearchResult {
  count: number;
  result: Array<{
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
  }>;
}

export interface EarningsEvent {
  date: string;       // YYYY-MM-DD
  epsActual: number | null;
  epsEstimate: number | null;
  hour: string;       // bmo | amc | dmh
  quarter: number;
  revenueActual: number | null;
  revenueEstimate: number | null;
  symbol: string;
  year: number;
}

export interface EarningsCalendarResponse {
  earningsCalendar: EarningsEvent[];
}
