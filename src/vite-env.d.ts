/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FINNHUB_API_KEY?: string;
  readonly VITE_TWELVE_DATA_API_KEY?: string;
  readonly VITE_NEWSAPI_API_KEY?: string;
  readonly VITE_MISTRAL_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_FMP_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.css';
