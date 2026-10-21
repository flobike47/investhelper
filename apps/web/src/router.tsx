import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { RequireAuth } from '@/components/common/RequireAuth';
import { RouteError } from '@/components/common/RouteError';
import Dashboard from '@/pages/Dashboard';
import Recommendations from '@/pages/Recommendations';
import News from '@/pages/News';
import Watchlist from '@/pages/Watchlist';
import Podcast from '@/pages/Podcast';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import SharedPodcast from '@/pages/SharedPodcast';
import { runtimeConfig } from '@/lib/runtimeConfig';

// React Router veut un basename SANS slash de fin (ex: "/investhelper").
// Cas racine "/" → on passe undefined pour ne pas configurer de basename.
const basename =
  runtimeConfig.basePath === '/'
    ? undefined
    : runtimeConfig.basePath.replace(/\/$/, '');

export const router = createBrowserRouter(
  [
    { path: '/login', element: <Login />, errorElement: <RouteError fullPage /> },
    // Page publique : pas de RequireAuth. N'importe qui avec le token peut accéder.
    {
      path: '/share/:token',
      element: <SharedPodcast />,
      errorElement: <RouteError fullPage />,
    },
    {
      path: '/',
      element: (
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      ),
      // Filet de sécurité si le layout lui-même plante.
      errorElement: <RouteError fullPage />,
      children: [
        {
          // Route sans chemin : une exception dans une page s'affiche DANS le
          // layout (menu et header restent utilisables) au lieu de le remplacer.
          errorElement: <RouteError />,
          children: [
            { index: true, element: <Dashboard /> },
            { path: 'recommendations', element: <Recommendations /> },
            { path: 'watchlist', element: <Watchlist /> },
            { path: 'news', element: <News /> },
            { path: 'podcast', element: <Podcast /> },
            { path: 'settings', element: <Settings /> },
            { path: '*', element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename },
);
