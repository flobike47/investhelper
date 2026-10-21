/**
 * Service worker InvestHelper — rend l'app installable et utilisable hors
 * ligne pour sa coquille (les données restent en ligne : BFF, Supabase).
 *
 * Stratégies (requêtes GET de même origine uniquement) :
 *  - navigation (index.html)  : réseau d'abord, cache en secours → un
 *    déploiement est vu au prochain lancement, l'app démarre hors ligne ;
 *  - config.js                : réseau d'abord (substitué au boot du
 *    conteneur, ne doit jamais être servi périmé quand le réseau répond) ;
 *  - assets/* (noms hachés)   : cache d'abord, immuables ;
 *  - reste (icônes, manifeste): cache, rafraîchi en arrière-plan.
 * Tout le reste (BFF, Supabase, images d'actualités) n'est jamais intercepté.
 *
 * Chemins relatifs à l'emplacement du SW : l'app peut être servie sous un
 * sous-chemin (BASE_PATH).
 */
const VERSION = 'v1';
const SHELL_CACHE = `ih-shell-${VERSION}`;
const ASSET_CACHE = 'ih-assets';
const MAX_ASSETS = 80;

const SCOPE = new URL('./', self.location).pathname;
const SHELL = ['./', 'config.js', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('ih-shell-') && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Garde le cache d'assets borné : supprime les plus anciennes entrées. */
async function trimAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)));
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackUrl ?? request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(fallbackUrl ?? request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trimAssets();
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;

  const path = url.pathname.slice(SCOPE.length);

  if (request.mode === 'navigate') {
    // Toutes les routes de la SPA retombent sur la coquille en cache
    event.respondWith(networkFirst(request, new URL('./', self.location).href));
  } else if (path === 'config.js') {
    event.respondWith(networkFirst(request));
  } else if (path.startsWith('assets/')) {
    event.respondWith(cacheFirst(request));
  } else if (path !== 'sw.js') {
    event.respondWith(staleWhileRevalidate(request));
  }
});
