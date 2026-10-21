import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/components/common/RequireAuth';
import { RouteError } from '@/components/common/RouteError';
import { PageLoader } from '@/components/common/PageLoader';
import { runtimeConfig } from '@/lib/runtimeConfig';

// React Router veut un basename SANS slash de fin (ex: "/investhelper").
// Cas racine "/" → on passe undefined pour ne pas configurer de basename.
const basename =
  runtimeConfig.basePath === '/'
    ? undefined
    : runtimeConfig.basePath.replace(/\/$/, '');

/**
 * Code-splitting : chaque page est un chunk chargé à la navigation (propriété
 * `lazy` de React Router). Le routeur attend le chunk avant de changer de
 * page, et un échec d'import remonte au `errorElement` le plus proche.
 */
function page(load: () => Promise<{ default: ComponentType }>) {
  return () => load().then((m) => ({ Component: m.default }));
}

export const router = createBrowserRouter(
  [
    {
      path: '/login',
      lazy: page(() => import('@/pages/Login')),
      hydrateFallbackElement: <PageLoader />,
      errorElement: <RouteError fullPage />,
    },
    // Page publique : pas de RequireAuth. N'importe qui avec le token peut accéder.
    {
      path: '/share/:token',
      lazy: page(() => import('@/pages/SharedPodcast')),
      hydrateFallbackElement: <PageLoader />,
      errorElement: <RouteError fullPage />,
    },
    {
      path: '/',
      // Le layout (menu, drawer…) est lui aussi un chunk : la page de login
      // n'en a pas besoin.
      lazy: async () => {
        const { default: AppLayout } = await import('@/components/layout/AppLayout');
        return {
          element: (
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          ),
        };
      },
      hydrateFallbackElement: <PageLoader />,
      // Filet de sécurité si le layout lui-même plante.
      errorElement: <RouteError fullPage />,
      children: [
        {
          // Route sans chemin : une exception dans une page s'affiche DANS le
          // layout (menu et header restent utilisables) au lieu de le remplacer.
          errorElement: <RouteError />,
          children: [
            // Watchlist (accueil) et Idées : liste + fiche d'un actif en route
            // enfant (panneau sur mobile, colonne sur PC). L'URL de la fiche
            // est partageable et le bouton retour la referme.
            {
              lazy: page(() => import('@/pages/Home')),
              children: [
                { index: true },
                { path: 'asset/:symbol', lazy: page(() => import('@/pages/Asset')) },
              ],
            },
            {
              path: 'ideas',
              lazy: page(() => import('@/pages/Ideas')),
              children: [
                { index: true },
                { path: 'asset/:symbol', lazy: page(() => import('@/pages/Asset')) },
              ],
            },
            { path: 'news', lazy: page(() => import('@/pages/News')) },
            { path: 'podcast', lazy: page(() => import('@/pages/Podcast')) },
            { path: 'settings', lazy: page(() => import('@/pages/Settings')) },
            // Anciennes adresses (favoris, liens partagés)
            { path: 'recommendations', element: <Navigate to="/ideas" replace /> },
            { path: 'watchlist', element: <Navigate to="/" replace /> },
            { path: '*', element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename },
);
