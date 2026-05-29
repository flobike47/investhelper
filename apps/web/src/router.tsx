import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { RequireAuth } from '@/components/common/RequireAuth';
import Dashboard from '@/pages/Dashboard';
import Recommendations from '@/pages/Recommendations';
import News from '@/pages/News';
import Watchlist from '@/pages/Watchlist';
import Podcast from '@/pages/Podcast';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import { runtimeConfig } from '@/lib/runtimeConfig';

// React Router veut un basename SANS slash de fin (ex: "/investhelper").
// Cas racine "/" → on passe undefined pour ne pas configurer de basename.
const basename =
  runtimeConfig.basePath === '/'
    ? undefined
    : runtimeConfig.basePath.replace(/\/$/, '');

export const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    {
      path: '/',
      element: (
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      ),
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
  { basename },
);
