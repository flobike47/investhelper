import { gemini } from '@/services/gemini';
import { newsapi } from '@/services/newsapi';
import type { NewsApiArticle } from '@/types/news';

const WORDS_PER_MINUTE_FR = 160; // débit moyen d'un présentateur en français

export interface ScriptInput {
  categories: string[];
  targetMinutes?: number;
}

export interface ScriptResult {
  script: string;
  sources: string[];
  durationEstimateSec: number;
}

/**
 * Récupère les news des catégories choisies puis demande à Gemini de
 * composer un script de podcast en français. Aucune prédiction de prix
 * chiffrée n'est faite ; on reste sur du factuel/synthèse.
 */
export async function generatePodcastScript(input: ScriptInput): Promise<ScriptResult> {
  const targetMin = input.targetMinutes ?? 4;

  // 1. Fetch les news par catégorie en parallèle. On utilise NewsAPI everything
  // avec language=fr et le nom de la catégorie comme query.
  const results = await Promise.all(
    input.categories.map(async (cat) => {
      try {
        const res = await newsapi.everything({ q: cat, language: 'fr', pageSize: 8 });
        return { category: cat, articles: res.articles };
      } catch {
        return { category: cat, articles: [] as NewsApiArticle[] };
      }
    }),
  );

  const allArticles = results.flatMap((r) => r.articles);
  const sources = allArticles.map((a) => a.url);

  if (allArticles.length === 0) {
    throw new Error(
      "Aucun article trouvé pour les catégories choisies. Essaye d'autres termes (ex: 'IA', 'CAC40', 'inflation').",
    );
  }

  // 2. Compose le corpus structuré qu'on envoie au LLM
  const corpus = results
    .filter((r) => r.articles.length > 0)
    .map(
      (r) =>
        `## ${r.category}\n` +
        r.articles
          .slice(0, 6)
          .map(
            (a) =>
              `- ${a.title}${a.description ? ` — ${a.description}` : ''} (source: ${a.source.name})`,
          )
          .join('\n'),
    )
    .join('\n\n');

  // 3. Génère le script via Gemini — format émission de radio dialoguée
  const script = await gemini.text(
    {
      system:
        "Tu écris le script d'une émission de radio économique française quotidienne. " +
        "Deux animateurs en plateau : Alex (homme, ton posé, le 'cadre' qui resitue) " +
        "et Sophie (femme, ton dynamique, qui réagit, questionne, ajoute des précisions). " +
        "Ils dialoguent vraiment, se passent la parole, se relancent, marquent des accords " +
        "ou nuances. Style français parlé, vivant, sans être familier. Tu te bases " +
        "STRICTEMENT sur les news fournies — aucun chiffre, citation ou nom inventé. " +
        "Tu ne fais AUCUNE prédiction de prix ni recommandation d'achat / de vente.",
      user: `Voici les actualités du jour à couvrir, regroupées par thème :

${corpus}

Compose le script d'une émission de ~${targetMin} minutes (~${targetMin * WORDS_PER_MINUTE_FR} mots au total entre les deux animateurs).

Format STRICT :
- Chaque réplique commence sur sa propre ligne par "Alex:" ou "Sophie:" (deux points, espace, texte).
- N'utilise QUE ces deux noms exactement, jamais "Présentateur" ou autre.
- Aucun balisage, aucune indication scénique (pas de "(rire)", "(transition)", "[jingle]").
- Aucune liste, puce ou markdown — texte continu uniquement, comme on le lirait à l'antenne.
- Démarre par une accroche d'Alex qui plante les sujets en 1-2 phrases, puis Sophie enchaîne.
- Alternance fréquente : pas plus de 3-4 phrases d'affilée par animateur.
- Sophie pose parfois des questions courtes à Alex ("Et concrètement, qu'est-ce que ça change ?").
- Cite explicitement les sources quand pertinent ("selon Les Échos", "rapporte Reuters").
- Clôture par Alex qui ouvre sur la journée à venir, puis Sophie en une phrase.

Exemple de format attendu :
Alex: Bonjour, dans cette édition trois sujets...
Sophie: Et on commence justement par la BCE...
Alex: ...

Rends UNIQUEMENT le script, rien d'autre.`,
    },
    { temperature: 0.5, maxOutputTokens: 4000 },
  );

  // 4. Estime la durée à partir du nombre de mots
  const wordCount = script.split(/\s+/).filter(Boolean).length;
  const durationEstimateSec = Math.round((wordCount / WORDS_PER_MINUTE_FR) * 60);

  return {
    script: script.trim(),
    sources: [...new Set(sources)],
    durationEstimateSec,
  };
}
