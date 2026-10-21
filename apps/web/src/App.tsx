import { useEffect } from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import frFR from 'antd/locale/fr_FR';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { documentThemeFor, themeConfigFor } from './theme';
import { useLocalSettings } from './store/localSettings';
import { AuthProvider } from './lib/auth';
import { applyDocumentTheme } from './lib/documentTheme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  const mode = useLocalSettings((s) => s.theme);

  // Barre d'état mobile, color-scheme et fond du body suivent le thème choisi
  // dans l'app (pas celui de l'OS).
  useEffect(() => applyDocumentTheme(documentThemeFor(mode)), [mode]);

  return (
    <ConfigProvider locale={frFR} theme={themeConfigFor(mode)}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
