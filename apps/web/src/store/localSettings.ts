import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Horizon } from '@/constants/horizons';

/**
 * Settings strictement locaux à l'appareil (pas synchronisés Supabase) :
 *  - horizon et theme sont initialement chargés depuis le serveur via
 *    useUserSettings, puis miroir local pour éviter un flicker au reload.
 *  - C'est aussi cette source qu'on lit pour styler ConfigProvider AntD
 *    avant que le user soit connecté.
 */
interface LocalSettings {
  horizon: Horizon;
  theme: 'dark' | 'light';
  setHorizon: (h: Horizon) => void;
  setTheme: (t: 'dark' | 'light') => void;
}

export const useLocalSettings = create<LocalSettings>()(
  persist(
    (set) => ({
      horizon: 'medium',
      theme: 'dark',
      setHorizon: (horizon) => set({ horizon }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'investhelper.localSettings' },
  ),
);
