import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Horizon } from '@/constants/horizons';
import { setFinnhubKey } from '@/services/finnhub';
import { setNewsApiKey } from '@/services/newsapi';
import { setTwelveDataKey } from '@/services/twelvedata';
import { setMistralKey } from '@/services/mistral';
import { setFmpKey } from '@/services/fmp';
import { setYahooProxy } from '@/services/yahoo';
import { setGeminiKey } from '@/services/gemini';

interface SettingsState {
  finnhubKey: string;
  twelveDataKey: string;
  newsApiKey: string;
  mistralKey: string;       // legacy, conservé pour compat — non utilisé activement
  geminiKey: string;
  fmpKey: string;
  yahooProxyUrl: string;
  yahooProxySecret: string;
  horizon: Horizon;
  theme: 'dark' | 'light';
  setFinnhubKey: (key: string) => void;
  setTwelveDataKey: (key: string) => void;
  setNewsApiKey: (key: string) => void;
  setMistralKey: (key: string) => void;
  setGeminiKey: (key: string) => void;
  setFmpKey: (key: string) => void;
  setYahooProxy: (url: string, secret: string) => void;
  setHorizon: (h: Horizon) => void;
  setTheme: (t: 'dark' | 'light') => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      finnhubKey: '',
      twelveDataKey: '',
      newsApiKey: '',
      mistralKey: '',
      geminiKey: '',
      fmpKey: '',
      yahooProxyUrl: '',
      yahooProxySecret: '',
      horizon: 'medium',
      theme: 'dark',
      setFinnhubKey: (key) => {
        setFinnhubKey(key || null);
        set({ finnhubKey: key });
      },
      setTwelveDataKey: (key) => {
        setTwelveDataKey(key || null);
        set({ twelveDataKey: key });
      },
      setNewsApiKey: (key) => {
        setNewsApiKey(key || null);
        set({ newsApiKey: key });
      },
      setMistralKey: (key) => {
        setMistralKey(key || null);
        set({ mistralKey: key });
      },
      setGeminiKey: (key) => {
        setGeminiKey(key || null);
        set({ geminiKey: key });
      },
      setFmpKey: (key) => {
        setFmpKey(key || null);
        set({ fmpKey: key });
      },
      setYahooProxy: (url, secret) => {
        setYahooProxy(url || null, secret || null);
        set({ yahooProxyUrl: url, yahooProxySecret: secret });
      },
      setHorizon: (horizon) => set({ horizon }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'investhelper.settings',
      onRehydrateStorage: () => (state) => {
        if (state?.finnhubKey) setFinnhubKey(state.finnhubKey);
        if (state?.twelveDataKey) setTwelveDataKey(state.twelveDataKey);
        if (state?.newsApiKey) setNewsApiKey(state.newsApiKey);
        if (state?.mistralKey) setMistralKey(state.mistralKey);
        if (state?.geminiKey) setGeminiKey(state.geminiKey);
        if (state?.fmpKey) setFmpKey(state.fmpKey);
        if (state?.yahooProxyUrl || state?.yahooProxySecret) {
          setYahooProxy(state.yahooProxyUrl || null, state.yahooProxySecret || null);
        }
      },
    },
  ),
);
