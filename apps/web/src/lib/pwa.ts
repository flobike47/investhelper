/**
 * PWA : enregistrement du service worker et détection du contexte
 * d'installation. Fonctions pures sur `navigator`/`window` injectables, donc
 * testables sans navigateur.
 */

interface NavigatorLike {
  userAgent: string;
  maxTouchPoints?: number;
  platform?: string;
  /** Propriété non standard de Safari iOS : vrai quand lancée depuis l'écran d'accueil. */
  standalone?: boolean;
  serviceWorker?: { register: (url: string, opts?: { scope?: string }) => Promise<unknown> };
}

interface WindowLike {
  matchMedia?: (q: string) => { matches: boolean };
}

/** iPhone / iPad (iPadOS se présente comme un Mac : on le repère au tactile). */
export function isIos(nav: NavigatorLike): boolean {
  if (/iPhone|iPad|iPod/i.test(nav.userAgent)) return true;
  return /Macintosh/i.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/** Safari iOS « nu » — pas Chrome/Firefox/Edge iOS, qui ne savent pas installer de PWA. */
export function isIosSafari(nav: NavigatorLike): boolean {
  return isIos(nav) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(nav.userAgent);
}

/** Vrai quand l'app tourne installée (écran d'accueil), pas dans un onglet. */
export function isStandalone(nav: NavigatorLike, win: WindowLike): boolean {
  if (nav.standalone === true) return true;
  return win.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

/**
 * L'aide « Sur l'écran d'accueil » n'a de sens que sur Safari iOS hors app
 * installée : iOS n'expose pas d'invite d'installation (`beforeinstallprompt`).
 */
export function shouldShowIosInstallHint(nav: NavigatorLike, win: WindowLike): boolean {
  return isIosSafari(nav) && !isStandalone(nav, win);
}

/**
 * Enregistre `sw.js` à côté de l'app. Résolu contre `document.baseURI` (la
 * balise <base href> posée au boot du conteneur) : fonctionne sous BASE_PATH.
 * Échec silencieux : sans SW, l'app reste pleinement fonctionnelle en ligne.
 */
export function registerServiceWorker(
  nav: NavigatorLike = navigator,
  baseUri: string = document.baseURI,
): void {
  if (!nav.serviceWorker) return;
  const url = new URL('sw.js', baseUri).href;
  const scope = new URL('./', baseUri).pathname;
  nav.serviceWorker.register(url, { scope }).catch((err: unknown) => {
    console.warn('[pwa] service worker non enregistré', err);
  });
}

type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Identifiant du build actuellement en ligne (`version.json`, écrit par
 * vite.config.ts), ou null s'il est illisible : hors ligne, fichier absent
 * (le SPA fallback renvoie alors du HTML)… Dans le doute, pas de bandeau.
 */
export async function fetchDeployedBuild(
  fetchFn: FetchLike = fetch,
  baseUri: string = document.baseURI,
): Promise<string | null> {
  try {
    const res = await fetchFn(new URL('version.json', baseUri).href, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: unknown } | null;
    return typeof body?.build === 'string' ? body.build : null;
  } catch {
    return null;
  }
}

/** Vrai quand une autre version que celle qui tourne a été mise en prod. */
export function isNewBuild(running: string, deployed: string | null): boolean {
  return deployed !== null && deployed !== running;
}
