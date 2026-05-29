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

export default defineConfig({
  plugins: [react(), replaceBasePathDev],

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
