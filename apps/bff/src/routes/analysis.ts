import type { FastifyInstance } from 'fastify';
import { cachedJson, TTL } from '../cache.js';
import { gemini } from '../providers/gemini.js';
import { finnhub } from '../providers/finnhub.js';
import { enforceQuota } from '../ratelimit.js';
import { requireUser } from '../auth.js';
import { getMarketThemes } from '../themes.js';
import { clampArray, validateString, validateSymbol } from '../validation.js';

interface TickerSentiment {
  /** `unknown` = pas assez d'actualités pour analyser : ce n'est pas un sentiment neutre. */
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' | 'unknown';
  score: number | null;
  drivers: string[];
  summary: string;
}

export async function registerAnalysisRoutes(app: FastifyInstance) {
  app.get<{ Params: { symbol: string } }>('/analysis/sentiment/:symbol', async (req) => {
    const user = requireUser(req);
    const s = validateSymbol(req.params.symbol);
    // v2 : les anciennes entrées présentaient l'absence d'actualité comme « neutral ».
    return cachedJson<TickerSentiment>(`sentiment:v2:${s}`, TTL.sentiment, async () => {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 14);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const news = (await finnhub.companyNews(s, iso(from), iso(to))) ?? [];

      // Pas d'actualité (ou endpoint réservé au plan payant pour ce marché) :
      // on le dit, sans appeler Gemini ni décompter le quota.
      if (news.length === 0) {
        return {
          sentiment: 'unknown',
          score: null,
          drivers: [],
          summary: "Pas assez d'actualités récentes pour une analyse.",
        };
      }
      await enforceQuota(user.id, 'sentiment');
      const headlines = news.slice(0, 20).map((n, i) => `${i + 1}. ${n.headline}`).join('\n');
      return gemini.json<TickerSentiment>(
        "Tu es un analyste financier rigoureux. Tu rends UNIQUEMENT un objet JSON valide, " +
          "sans markdown, sans préambule. Tu ne fais aucune prédiction de prix chiffrée et tu " +
          "ne donnes aucun conseil d'achat ou de vente. Tu décris ce que disent les news, point.",
        `Analyse l'actualité récente de l'action ${s}.

Titres (les plus récents en premier) :
${headlines}

Réponds avec ce schéma exact :
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "score": number entre -1 et 1,
  "drivers": ["2 à 4 mots-clés courts qui expliquent le sentiment"],
  "summary": "1 à 2 phrases en français, factuelles, sans prédiction de prix"
}`,
        { temperature: 0.1 },
      );
    });
  });

  app.get<{ Querystring: { sectors?: string } }>('/analysis/themes', async (req) => {
    const user = requireUser(req);
    // Bornage: 50 secteurs max, 30 caractères max par secteur, alphanumérique-only.
    // Sans secteur : tous ceux de l'univers.
    const sectors = clampArray(
      (req.query.sectors ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 30 && /^[a-z0-9_]+$/i.test(s)),
      50,
    );
    return getMarketThemes(user.id, sectors.length > 0 ? sectors : undefined);
  });
}

// Helpers pour mémoire — utilisés par podcast.ts via re-export potentiel
export { validateString };
