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
 * Notifications push (rappel quotidien du podcast) : chaque push affiche une
 * notification (Safari révoque l'abonnement sinon) ; un clic ouvre la route
 * indiquée dans le payload, toujours à l'intérieur du scope de l'app.
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

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Payload non JSON : notification générique
  }
  // Format Declarative Web Push du BFF ({ web_push: 8030, notification }) :
  // Safari l'affiche seul, Chrome et Firefox le livrent ici. Format plat
  // accepté aussi (anciens envois).
  // (`|| {}` : un payload JSON `null` ne doit pas empêcher l'affichage)
  const n = (data && data.web_push === 8030 && data.notification) || data || {};
  event.waitUntil(
    self.registration.showNotification(n.title || 'InvestHelper', {
      body: n.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: n.tag || 'investhelper',
      data: { url: n.navigate || n.url || './' },
    }),
  );
});

/** URL à ouvrir au clic, bornée au scope : un payload ne peut pas envoyer ailleurs. */
function notificationTarget(notification) {
  const scope = self.registration.scope;
  try {
    const url = new URL(notification.data?.url || './', scope).href;
    return url.startsWith(scope) ? url : scope;
  } catch {
    return scope;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((c) => c.url.startsWith(self.registration.scope));
      if (open) {
        // Recharge sur la route : la liste d'épisodes est à jour
        await open.focus();
        if (open.url !== target) await open.navigate(target).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
