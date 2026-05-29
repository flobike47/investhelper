import { gemini } from '@/services/gemini';
import type { CompanyNewsItem } from '@/types/finnhub';
import type { NewsApiArticle } from '@/types/news';

export interface TickerSentiment {
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  score: number; // -1..1
  drivers: string[];
  summary: string;
}

export async function analyzeTickerNews(
  symbol: string,
  news: CompanyNewsItem[],
): Promise<TickerSentiment> {
  if (news.length === 0) {
    return {
      sentiment: 'neutral',
      score: 0,
      drivers: [],
      summary: 'Aucune actualité récente disponible.',
    };
  }

  const headlines = news.slice(0, 20).map((n, i) => `${i + 1}. ${n.headline}`).join('\n');

  return gemini.json<TickerSentiment>(
    {
      system:
        'Tu es un analyste financier rigoureux. Tu rends UNIQUEMENT un objet JSON valide, ' +
        'sans markdown, sans préambule. Tu ne fais aucune prédiction de prix chiffrée et tu ' +
        "ne donnes aucun conseil d'achat ou de vente. Tu décris ce que disent les news, point.",
      user: `Analyse l'actualité récente de l'action ${symbol}.

Titres (les plus récents en premier) :
${headlines}

Réponds avec ce schéma exact :
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "score": number entre -1 et 1,
  "drivers": ["2 à 4 mots-clés courts qui expliquent le sentiment"],
  "summary": "1 à 2 phrases en français, factuelles, sans prédiction de prix"
}`,
    },
    { temperature: 0.1 },
  );
}

export interface MarketThemes {
  themes: Array<{
    name: string;        // ex: "Infrastructure IA"
    direction: 'bullish' | 'bearish' | 'neutral';
    sectors: string[];   // tags issus du universe (ai, semis, energy, defense, etc.)
    summary: string;     // 1 phrase
  }>;
}

export async function extractMarketThemes(
  worldArticles: NewsApiArticle[],
  financialArticles: NewsApiArticle[],
  knownSectors: string[],
): Promise<MarketThemes> {
  const corpus = [
    ...worldArticles.slice(0, 30).map((a) => `[monde] ${a.title}`),
    ...financialArticles.slice(0, 30).map((a) => `[finance] ${a.title}`),
  ].join('\n');

  return gemini.json<MarketThemes>(
    {
      system:
        "Tu es un analyste macro. Tu identifies les thèmes dominants dans l'actualité du jour " +
        'et tu juges leur direction (bullish/bearish pour les marchés actions exposés). ' +
        'Tu rends UNIQUEMENT un JSON valide. Aucune prédiction de prix chiffrée.',
      user: `Voici des titres d'actualité récents (mélange monde + finance) :

${corpus}

Identifie 3 à 5 thèmes dominants. Pour chacun, choisis les secteurs concernés UNIQUEMENT parmi cette liste :
${knownSectors.join(', ')}

Réponds avec ce schéma exact :
{
  "themes": [
    {
      "name": "Nom court du thème en français",
      "direction": "bullish" | "bearish" | "neutral",
      "sectors": ["choisis parmi la liste fournie"],
      "summary": "1 phrase en français qui explique le thème"
    }
  ]
}`,
    },
    { temperature: 0.2 },
  );
}
