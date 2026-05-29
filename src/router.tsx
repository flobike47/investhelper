import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Recommendations from '@/pages/Recommendations';
import News from '@/pages/News';
import Watchlist from '@/pages/Watchlist';
import Podcast from '@/pages/Podcast';
import Settings from '@/pages/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
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
]);
