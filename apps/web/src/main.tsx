import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import App from './App';
import { registerServiceWorker } from './lib/pwa';
import './styles.css';

// Locale globale : toutes les dates formatées via dayjs (« 21 octobre 2026 »,
// noms de jours, relatifs…) sortent en français, quelle que soit la page.
dayjs.locale('fr');

// PWA : en production seulement (en dev, un SW mettrait en cache le serveur Vite).
if (import.meta.env.PROD) registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
