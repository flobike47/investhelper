/**
 * Détails d'un épisode : sources détaillées et sujets (topics) avec leur
 * position dans le script. Logique pure, sans I/O : partagée par la
 * génération (podcastScript.ts), les routes d'épisodes et le job de rappel.
 */

export const MAX_SOURCE_DETAILS = 100;
export const MAX_TOPICS = 8;

const MAX_URL_LEN = 2048;
const MAX_TITLE_LEN = 300;
const MAX_TOPIC_TITLE_LEN = 120;
const MAX_SUMMARY_LEN = 300;
const MAX_ANCHOR_LEN = 80;
const MAX_CATEGORY_LEN = 60;

export interface SourceDetail {
  url: string;
  title: string | null;
  publisher: string | null;
  /** Catégorie utilisateur pour laquelle l'article a été récupéré. */
  category: string | null;
  publishedAt: string | null;
}

export interface Topic {
  title: string;
  summary: string;
  /** Catégorie utilisateur, ou null si Gemini en a renvoyé une inconnue. */
  category: string | null;
  /** Position du début du sujet dans le script, entre 0 et 1. */
  startRatio: number;
}

/** Article tel que renvoyé par NewsAPI, avec la catégorie de la requête qui l'a ramené. */
export interface CategorizedArticle {
  url: string;
  title: string;
  publisher: string | null;
  publishedAt: string | null;
}

export interface CategoryResult {
  category: string;
  articles: CategorizedArticle[];
}

/** Vrai uniquement pour une URL absolue http(s). */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LEN) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function optionalString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s.length === 0) return null;
  return s.slice(0, max);
}

/**
 * Construit les sources détaillées depuis les articles par catégorie.
 * Dédoublonnage par URL en gardant la première occurrence (ordre stable).
 */
export function buildSourceDetails(results: CategoryResult[]): SourceDetail[] {
  const seen = new Set<string>();
  const out: SourceDetail[] = [];
  for (const r of results) {
    for (const a of r.articles) {
      if (!isHttpUrl(a.url) || seen.has(a.url)) continue;
      seen.add(a.url);
      out.push({
        url: a.url,
        title: optionalString(a.title, MAX_TITLE_LEN),
        publisher: optionalString(a.publisher ?? '', 120),
        category: r.category,
        publishedAt: optionalString(a.publishedAt ?? '', 40),
      });
    }
  }
  return out.slice(0, MAX_SOURCE_DETAILS);
}

/**
 * Valide les sources envoyées par le client. Les entrées invalides (URL non
 * http(s), type inattendu) sont écartées ; le client ne fait pas échouer l'envoi.
 */
export function sanitizeSourceDetails(input: unknown): SourceDetail[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: SourceDetail[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (!isHttpUrl(o.url) || seen.has(o.url)) continue;
    seen.add(o.url);
    out.push({
      url: o.url,
      title: optionalString(o.title, MAX_TITLE_LEN),
      publisher: optionalString(o.publisher, 120),
      category: optionalString(o.category, MAX_CATEGORY_LEN),
      publishedAt: optionalString(o.publishedAt, 40),
    });
    if (out.length >= MAX_SOURCE_DETAILS) break;
  }
  return out;
}

/**
 * Valide les sujets envoyés par le client. Entrées invalides écartées,
 * startRatio borné à [0, 1], au plus MAX_TOPICS sujets.
 */
export function sanitizeTopics(input: unknown): Topic[] {
  if (!Array.isArray(input)) return [];
  const out: Topic[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = optionalString(o.title, MAX_TOPIC_TITLE_LEN);
    const ratio = typeof o.startRatio === 'number' && Number.isFinite(o.startRatio) ? o.startRatio : null;
    if (!title || ratio === null) continue;
    out.push({
      title,
      summary: optionalString(o.summary, MAX_SUMMARY_LEN) ?? '',
      category: optionalString(o.category, MAX_CATEGORY_LEN),
      startRatio: Math.min(1, Math.max(0, ratio)),
    });
    if (out.length >= MAX_TOPICS) break;
  }
  return out;
}

/**
 * Position (0..1) de `anchor` dans `script`. Recherche exacte puis sans
 * tenir compte de la casse. Renvoie null si introuvable.
 */
export function computeStartRatio(script: string, anchor: string): number | null {
  if (!script) return null;
  let idx = script.indexOf(anchor);
  if (idx < 0) idx = script.toLowerCase().indexOf(anchor.toLowerCase());
  if (idx < 0) return null;
  return Math.min(1, Math.max(0, idx / script.length));
}

interface RawTopic {
  title: string;
  summary: string;
  category: string | null;
  anchor: string;
}

/**
 * Parse et valide la sortie JSON de Gemini `{ topics: [...] }`.
 * Stricte : au moindre écart de forme (type, longueur, nombre de sujets),
 * renvoie [] — on préfère pas de sujets à des sujets faux. Une catégorie
 * inconnue donne null sans invalider le sujet. Un ancrage introuvable
 * donne une répartition régulière (i / n).
 */
export function parseTopicsOutput(raw: string, script: string, categories: string[]): Topic[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== 'object') return [];
  const list = (data as { topics?: unknown }).topics;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_TOPICS) return [];

  const parsed: RawTopic[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') return [];
    const o = item as Record<string, unknown>;
    if (typeof o.title !== 'string' || typeof o.summary !== 'string' || typeof o.anchor !== 'string') return [];
    if (o.category !== null && typeof o.category !== 'string') return [];
    const title = o.title.trim();
    const summary = o.summary.trim();
    const anchor = o.anchor.trim();
    if (title.length < 1 || title.length > MAX_TOPIC_TITLE_LEN) return [];
    if (summary.length < 1 || summary.length > MAX_SUMMARY_LEN) return [];
    if (anchor.length < 1 || anchor.length > MAX_ANCHOR_LEN) return [];
    const category = typeof o.category === 'string' && categories.includes(o.category) ? o.category : null;
    parsed.push({ title, summary, category, anchor });
  }

  const n = parsed.length;
  const topics: Topic[] = parsed.map((t, i) => {
    const ratio = computeStartRatio(script, t.anchor);
    return {
      title: t.title,
      summary: t.summary,
      category: t.category,
      startRatio: ratio ?? i / n,
    };
  });
  return topics.sort((a, b) => a.startRatio - b.startRatio);
}
