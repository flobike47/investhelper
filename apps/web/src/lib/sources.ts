/**
 * Lecture lisible des sources d'un épisode : nom du média et titre déduit de
 * l'URL. Logique pure (aucun import React), testable unitairement.
 */

export interface ParsedSource {
  /** URL d'origine, telle que reçue (à utiliser comme href). */
  url: string;
  /** Nom d'hôte sans `www.`. */
  host: string;
  /** Nom du média (table connue, sinon l'hôte). */
  publisher: string;
  /** Titre lisible déduit du chemin (sinon le nom du média). */
  title: string;
}

/** Domaine → nom affiché. Le sous-domaine (finance.yahoo.com) est reconnu. */
const KNOWN_PUBLISHERS: ReadonlyArray<readonly [domain: string, name: string]> = [
  ['lesechos.fr', 'Les Echos'],
  ['reuters.com', 'Reuters'],
  ['boursorama.com', 'Boursorama'],
  ['ft.com', 'Financial Times'],
  ['bfmtv.com', 'BFM Business'],
  ['zonebourse.com', 'Zonebourse'],
  ['lefigaro.fr', 'Le Figaro'],
  ['lemonde.fr', 'Le Monde'],
  ['bloomberg.com', 'Bloomberg'],
  ['cnbc.com', 'CNBC'],
  ['wsj.com', 'The Wall Street Journal'],
  ['investing.com', 'Investing.com'],
  ['yahoo.com', 'Yahoo Finance'],
];

/** Segments de chemin génériques : jamais un titre à eux seuls. */
const GENERIC_SEGMENTS = new Set(['content', 'article', 'articles', 'amp', 'index', 'news', 'story']);

/** Extension de page en fin de segment (.html, .php…). */
const PAGE_EXTENSION = /\.(html?|php|aspx?|jsp|shtml)$/i;

/**
 * Suffixes d'identifiant ou de date en fin de slug, retirés en boucle :
 * `-2101234`, `_AV-202611220341`, `-2026-11-22`. Un mot suivi de chiffres
 * (`fed-2026`) n'est retiré que s'il s'agit d'une date ou d'un identifiant.
 */
const TRAILING_IDS = /(?:[-_]\d+|[-_][a-z]{1,6}-\d{5,})+$/i;

/**
 * Identifiant en tête de slug, suivi d'un séparateur : `4264740-20261122-`,
 * `3333723_`, `1558081-`. Un identifiant numérique de 5 chiffres ou plus.
 */
const LEADING_IDS = /^(?:\d{5,}[-_])+/;

/**
 * Identifiant alphanumérique majuscule en fin de slug (ex. La Voix du Nord :
 * `-LLBDRLYSXBFXNNF7VCMAOHGWEA`). Testé AVANT la mise en minuscules.
 */
const TRAILING_UPPER_ID = /[-_][A-Z0-9]{16,}$/;

/** Segments qui sont un identifiant (et non un titre), une fois le slug nettoyé. */
const IDENTIFIER = /^[\d_-]*$|^[0-9a-f]{16,}$|^[a-z]{1,6}[-_]?\d{5,}$/i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function publisherFor(host: string): string {
  const match = KNOWN_PUBLISHERS.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return match ? match[1] : host;
}

/** Un segment de chemin → titre lisible, ou `null` si ce n'est pas un titre. */
function readableSegment(segment: string): string | null {
  const slug = segment
    .replace(PAGE_EXTENSION, '')
    .replace(LEADING_IDS, '')
    .replace(TRAILING_UPPER_ID, '')
    .replace(TRAILING_IDS, '');
  if (!slug || GENERIC_SEGMENTS.has(slug.toLowerCase()) || IDENTIFIER.test(slug)) return null;
  const words = slug.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  return /\p{L}{2,}/u.test(words) ? words : null;
}

/** Titre déduit du dernier segment exploitable du chemin, ou `null`. */
function titleFromPath(pathname: string): string | null {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map(safeDecode);
  for (let i = segments.length - 1; i >= 0; i--) {
    const words = readableSegment(segments[i]);
    if (words) return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return null;
}

/** true seulement pour http(s) : un lien source ne doit jamais être `javascript:` ou `data:`. */
export function isHttpUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Découpe une URL source en média et titre. Une URL invalide (ou non http) ne
 * lève pas : host, média et titre valent alors l'entrée brute.
 */
export function parseSourceUrl(url: string): ParsedSource {
  if (!isHttpUrl(url)) return { url, host: url, publisher: url, title: url };

  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, '');
  const publisher = publisherFor(host);
  const title = titleFromPath(parsed.pathname) ?? publisher;
  return { url, host, publisher, title };
}
