import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_CATEGORIES = [
  'Macro / banques centrales',
  'Tech & IA',
  'Marchés actions',
];

export interface PodcastEpisode {
  id: string;            // timestamp ms
  date: string;          // ISO YYYY-MM-DD
  categories: string[];  // catégories couvertes
  script: string;        // texte intégral à lire
  sources: string[];     // URLs des news utilisées
  durationEstimateSec: number;
}

interface PodcastState {
  categories: string[];
  episodes: PodcastEpisode[];     // historique, plus récent en premier
  addCategory: (name: string) => void;
  removeCategory: (name: string) => void;
  resetCategories: () => void;
  addEpisode: (ep: PodcastEpisode) => void;
  deleteEpisode: (id: string) => void;
  clearAllEpisodes: () => void;
}

const MAX_EPISODES = 30;

export const usePodcast = create<PodcastState>()(
  persist(
    (set, get) => ({
      categories: DEFAULT_CATEGORIES,
      episodes: [],
      addCategory: (raw) => {
        const name = raw.trim();
        if (!name) return;
        const current = get().categories;
        if (current.some((c) => c.toLowerCase() === name.toLowerCase())) return;
        set({ categories: [...current, name] });
      },
      removeCategory: (name) =>
        set({ categories: get().categories.filter((c) => c !== name) }),
      resetCategories: () => set({ categories: DEFAULT_CATEGORIES }),
      addEpisode: (ep) => {
        const next = [ep, ...get().episodes].slice(0, MAX_EPISODES);
        set({ episodes: next });
      },
      deleteEpisode: (id) =>
        set({ episodes: get().episodes.filter((e) => e.id !== id) }),
      clearAllEpisodes: () => set({ episodes: [] }),
    }),
    { name: 'investhelper.podcast' },
  ),
);
