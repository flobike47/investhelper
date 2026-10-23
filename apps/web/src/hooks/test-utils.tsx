/**
 * Utilitaires de test partagés (importés uniquement par les fichiers *.test.tsx).
 * Rend un composant dans les mêmes fournisseurs que l'app : QueryClient + App antd.
 */
import '@testing-library/jest-dom/vitest';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';

// Même locale que l'app (main.tsx) : dates en français dans les tests
dayjs.locale('fr');

// Sans `globals: true`, Testing Library ne nettoie pas le DOM tout seul
afterEach(() => cleanup());

// jsdom n'implémente pas matchMedia, utilisé par les composants responsives d'antd
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Styles antd (CSS-in-JS) injectés hors du document. Dans la page, ils
// ajoutent ~1 000 règles CSS et chaque getComputedStyle de jsdom coûte alors
// ~20 ms. getByRole l'appelle sur chaque candidat (visibilité, nom
// accessible) : ~0,4 s par requête, et des tests qui dépassaient les 5 s
// sous charge. Contrepartie : ce qu'antd masque par CSS (tiroir fermé mais
// gardé monté) reste « visible » pour getByRole ; tester alors l'état
// (classe `ant-drawer-open`, callback) plutôt que la visibilité.
const antdStyles = document.createElement('div');

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export function renderWithProviders(ui: ReactElement, client = createTestQueryClient()) {
  const wrap = (node: ReactElement) => (
    <StyleProvider container={antdStyles}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <AntApp>
          <QueryClientProvider client={client}>{node}</QueryClientProvider>
        </AntApp>
      </ConfigProvider>
    </StyleProvider>
  );
  const utils = render(wrap(ui));
  return { ...utils, client, rerender: (next: ReactElement) => utils.rerender(wrap(next)) };
}

/** Comme renderWithProviders, dans un routeur mémoire (pages avec liens). */
export function renderPage(ui: ReactElement, path = '/') {
  const client = createTestQueryClient();
  const wrap = (node: ReactElement) => <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>;
  const utils = renderWithProviders(wrap(ui), client);
  return { ...utils, rerender: (next: ReactElement) => utils.rerender(wrap(next)) };
}
