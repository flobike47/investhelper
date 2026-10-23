import { useEffect, useMemo } from 'react';
import { ConfigProvider, App as AntApp, type ThemeConfig } from 'antd';
import frFR from 'antd/locale/fr_FR';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { documentThemeFor, themeConfigFor } from './theme';
import { useLocalSettings } from './store/localSettings';
import { AuthProvider } from './lib/auth';
import { applyDocumentTheme } from './lib/documentTheme';
import { usePrefersReducedMotion } from './components/common/usePrefersReducedMotion';

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
  const reduceMotion = usePrefersReducedMotion();

  const themeConfig = useMemo<ThemeConfig>(() => {
    const base = themeConfigFor(mode);
    // « Réduire les animations » côté OS : on coupe les transitions antd
    // (drawer, dropdown, collapse, messages…).
    return { ...base, token: { ...base.token, motion: !reduceMotion } };
  }, [mode, reduceMotion]);

  // Barre d'état mobile, color-scheme et fond du body suivent le thème choisi
  // dans l'app (pas celui de l'OS).
  useEffect(() => applyDocumentTheme(documentThemeFor(mode)), [mode]);

  return (
    <ConfigProvider locale={frFR} theme={themeConfig}>
      {/* Toasts sous la barre d'état de l'app installée (heure, Dynamic
          Island) ; l'inset vaut 0 ailleurs : 8 px, la valeur d'antd. */}
      <AntApp message={{ top: 'calc(8px + env(safe-area-inset-top, 0px))' }}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
