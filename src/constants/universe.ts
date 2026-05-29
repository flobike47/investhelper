/**
 * Univers curé de tickers réels classés par secteur thématique.
 * Utilisé par le moteur de recommandations pour mapper les thèmes
 * d'actualité (extraits par Mistral) vers des actifs investissables.
 *
 * Tous les symboles sont des tickers valides sur leur marché respectif
 * (US sans suffixe, Europe avec suffixe Yahoo/Twelve Data).
 */

export type Sector =
  | 'ai'
  | 'semis'
  | 'cloud'
  | 'consumer_tech'
  | 'defense'
  | 'energy_fossil'
  | 'energy_transition'
  | 'healthcare'
  | 'biotech'
  | 'banks'
  | 'luxury'
  | 'industrials'
  | 'china'
  | 'europe'
  | 'etf_broad'
  | 'etf_theme';

export interface UniverseEntry {
  symbol: string;
  name: string;
  sectors: Sector[];
}

export const SECTOR_LABELS: Record<Sector, string> = {
  ai: 'Intelligence artificielle',
  semis: 'Semi-conducteurs',
  cloud: 'Cloud / logiciel',
  consumer_tech: 'Tech grand public',
  defense: 'Défense',
  energy_fossil: 'Énergie fossile',
  energy_transition: 'Transition énergétique',
  healthcare: 'Santé',
  biotech: 'Biotech',
  banks: 'Banques',
  luxury: 'Luxe',
  industrials: 'Industrie',
  china: 'Chine',
  europe: 'Europe',
  etf_broad: 'ETF large',
  etf_theme: 'ETF thématique',
};

export const UNIVERSE: UniverseEntry[] = [
  // AI infrastructure & semis
  { symbol: 'NVDA', name: 'NVIDIA', sectors: ['ai', 'semis'] },
  { symbol: 'AMD', name: 'AMD', sectors: ['ai', 'semis'] },
  { symbol: 'AVGO', name: 'Broadcom', sectors: ['ai', 'semis'] },
  { symbol: 'TSM', name: 'TSMC', sectors: ['semis'] },
  { symbol: 'ASML', name: 'ASML', sectors: ['semis', 'europe'] },
  { symbol: 'AMAT', name: 'Applied Materials', sectors: ['semis'] },
  { symbol: 'LRCX', name: 'Lam Research', sectors: ['semis'] },
  { symbol: 'KLAC', name: 'KLA Corp', sectors: ['semis'] },
  { symbol: 'MU', name: 'Micron', sectors: ['semis'] },
  { symbol: 'ARM', name: 'Arm Holdings', sectors: ['semis', 'ai'] },
  { symbol: 'SMCI', name: 'Super Micro', sectors: ['ai'] },
  { symbol: 'VRT', name: 'Vertiv', sectors: ['ai', 'industrials'] },
  { symbol: 'ANET', name: 'Arista Networks', sectors: ['ai', 'cloud'] },

  // Cloud & enterprise software
  { symbol: 'MSFT', name: 'Microsoft', sectors: ['cloud', 'ai'] },
  { symbol: 'GOOGL', name: 'Alphabet', sectors: ['cloud', 'ai', 'consumer_tech'] },
  { symbol: 'AMZN', name: 'Amazon', sectors: ['cloud', 'consumer_tech'] },
  { symbol: 'ORCL', name: 'Oracle', sectors: ['cloud', 'ai'] },
  { symbol: 'CRM', name: 'Salesforce', sectors: ['cloud'] },
  { symbol: 'NOW', name: 'ServiceNow', sectors: ['cloud'] },
  { symbol: 'NET', name: 'Cloudflare', sectors: ['cloud'] },
  { symbol: 'PLTR', name: 'Palantir', sectors: ['ai', 'defense'] },

  // Consumer tech
  { symbol: 'AAPL', name: 'Apple', sectors: ['consumer_tech'] },
  { symbol: 'META', name: 'Meta Platforms', sectors: ['consumer_tech', 'ai'] },
  { symbol: 'NFLX', name: 'Netflix', sectors: ['consumer_tech'] },
  { symbol: 'TSLA', name: 'Tesla', sectors: ['consumer_tech', 'energy_transition'] },

  // Defense
  { symbol: 'LMT', name: 'Lockheed Martin', sectors: ['defense'] },
  { symbol: 'RTX', name: 'RTX', sectors: ['defense'] },
  { symbol: 'NOC', name: 'Northrop Grumman', sectors: ['defense'] },
  { symbol: 'GD', name: 'General Dynamics', sectors: ['defense'] },
  { symbol: 'BA', name: 'Boeing', sectors: ['defense', 'industrials'] },

  // Energy fossil
  { symbol: 'XOM', name: 'ExxonMobil', sectors: ['energy_fossil'] },
  { symbol: 'CVX', name: 'Chevron', sectors: ['energy_fossil'] },
  { symbol: 'COP', name: 'ConocoPhillips', sectors: ['energy_fossil'] },
  { symbol: 'SLB', name: 'SLB', sectors: ['energy_fossil'] },
  { symbol: 'TTE', name: 'TotalEnergies', sectors: ['energy_fossil', 'europe'] },

  // Energy transition
  { symbol: 'ENPH', name: 'Enphase Energy', sectors: ['energy_transition'] },
  { symbol: 'FSLR', name: 'First Solar', sectors: ['energy_transition'] },
  { symbol: 'NEE', name: 'NextEra Energy', sectors: ['energy_transition'] },

  // Healthcare & biotech
  { symbol: 'LLY', name: 'Eli Lilly', sectors: ['healthcare'] },
  { symbol: 'UNH', name: 'UnitedHealth', sectors: ['healthcare'] },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sectors: ['healthcare'] },
  { symbol: 'NVO', name: 'Novo Nordisk', sectors: ['healthcare', 'europe'] },
  { symbol: 'PFE', name: 'Pfizer', sectors: ['healthcare', 'biotech'] },
  { symbol: 'MRNA', name: 'Moderna', sectors: ['biotech'] },
  { symbol: 'REGN', name: 'Regeneron', sectors: ['biotech'] },

  // Banks
  { symbol: 'JPM', name: 'JPMorgan Chase', sectors: ['banks'] },
  { symbol: 'BAC', name: 'Bank of America', sectors: ['banks'] },
  { symbol: 'GS', name: 'Goldman Sachs', sectors: ['banks'] },

  // Luxe / Europe
  { symbol: 'MC.PA', name: 'LVMH', sectors: ['luxury', 'europe'] },
  { symbol: 'OR.PA', name: 'L\'Oréal', sectors: ['luxury', 'europe'] },
  { symbol: 'RMS.PA', name: 'Hermès', sectors: ['luxury', 'europe'] },
  { symbol: 'CFR.SW', name: 'Richemont', sectors: ['luxury', 'europe'] },
  { symbol: 'SAP.DE', name: 'SAP', sectors: ['cloud', 'europe'] },
  { symbol: 'SU.PA', name: 'Schneider Electric', sectors: ['industrials', 'europe', 'energy_transition'] },
  { symbol: 'AIR.PA', name: 'Airbus', sectors: ['defense', 'industrials', 'europe'] },
  { symbol: 'BNP.PA', name: 'BNP Paribas', sectors: ['banks', 'europe'] },

  // China
  { symbol: 'BABA', name: 'Alibaba', sectors: ['china', 'consumer_tech'] },
  { symbol: 'BIDU', name: 'Baidu', sectors: ['china', 'ai'] },
  { symbol: 'JD', name: 'JD.com', sectors: ['china', 'consumer_tech'] },

  // ETFs broad
  { symbol: 'VOO', name: 'Vanguard S&P 500', sectors: ['etf_broad'] },
  { symbol: 'VTI', name: 'Vanguard Total US Market', sectors: ['etf_broad'] },
  { symbol: 'QQQ', name: 'Invesco Nasdaq 100', sectors: ['etf_broad'] },
  { symbol: 'IWM', name: 'Russell 2000', sectors: ['etf_broad'] },
  { symbol: 'CSPX.L', name: 'iShares S&P 500 UCITS', sectors: ['etf_broad', 'europe'] },

  // ETFs themed
  { symbol: 'SMH', name: 'VanEck Semiconductors', sectors: ['etf_theme', 'semis'] },
  { symbol: 'XLK', name: 'Tech Select Sector', sectors: ['etf_theme', 'consumer_tech', 'cloud'] },
  { symbol: 'ITA', name: 'iShares Defense', sectors: ['etf_theme', 'defense'] },
  { symbol: 'XLE', name: 'Energy Select Sector', sectors: ['etf_theme', 'energy_fossil'] },
  { symbol: 'ICLN', name: 'iShares Clean Energy', sectors: ['etf_theme', 'energy_transition'] },
  { symbol: 'XBI', name: 'SPDR Biotech', sectors: ['etf_theme', 'biotech'] },
  { symbol: 'XLF', name: 'Financial Select Sector', sectors: ['etf_theme', 'banks'] },
  { symbol: 'XLV', name: 'Health Care Select Sector', sectors: ['etf_theme', 'healthcare'] },
];

export const ALL_SECTORS: Sector[] = Object.keys(SECTOR_LABELS) as Sector[];

export function symbolsForSectors(sectors: Sector[]): UniverseEntry[] {
  const set = new Set(sectors);
  return UNIVERSE.filter((u) => u.sectors.some((s) => set.has(s)));
}

export function findInUniverse(symbol: string): UniverseEntry | undefined {
  return UNIVERSE.find((u) => u.symbol === symbol);
}
