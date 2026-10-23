import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * En dev (npm run dev), le conteneur Docker n'existe pas → l'entrypoint
 * ne fait pas la substitution. On remplace `__BASE_PATH__` par `/` à la
 * volée pour que <base href> et /config.js soient résolus correctement.
 */
const replaceBasePathDev: Plugin = {
  name: 'replace-base-path-dev',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace(/__BASE_PATH__/g, '/');
  },
};

/**
 * Identifiant du build, figé au chargement de la config : injecté dans le
 * code (__BUILD_ID__) ET écrit dans dist/version.json. L'app compare les
 * deux au retour au premier plan pour proposer de recharger après une mise
 * en prod (une PWA iOS reprise en arrière-plan garde l'ancien code).
 */
const BUILD_ID = process.env.BUILD_ID || new Date().toISOString();

const emitVersionFile: Plugin = {
  name: 'emit-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
};

export default defineConfig({
  plugins: [react(), replaceBasePathDev, emitVersionFile],

  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },

  // base: './' → URLs d'assets émises relatives. Combinées avec <base href>
  // dans index.html (rempli au runtime par docker-entrypoint.sh), elles
  // résolvent correctement sous n'importe quel sous-chemin (/, /investhelper/...).
  base: './',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
