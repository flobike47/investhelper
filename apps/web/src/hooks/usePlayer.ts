import { useSyncExternalStore } from 'react';
import dayjs from 'dayjs';
import { api, ApiError, type PodcastEpisodeDto } from '@/services/api';
import { concatBytes, pcmToWavBlob, processWithConcurrency, splitDialogue } from '@/lib/audio';
import { PodcastPlayer, type PlayerEpisode } from '@/lib/player';

/** Voix Gemini des deux animateurs (mêmes valeurs que le BFF : cache TTS partagé). */
const SPEAKERS: Record<string, string> = { Alex: 'Charon', Sophie: 'Kore' };
/** Même découpage que le BFF (TTS_CHUNK_CHARS = 800) pour partager le cache TTS. */
const TTS_CHUNK_CHARS = 800;

/** Une nouvelle tentative pour un chunk, sauf erreur client (4xx : quota…). */
async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status !== null && e.status < 500) throw e;
    return fn();
  }
}

async function synthesizeHd(
  script: string,
  onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const chunks = splitDialogue(script, TTS_CHUNK_CHARS);
  if (chunks.length === 0) throw new Error('Script vide.');
  // 4 chunks en parallèle : 3-4× plus rapide que séquentiel, sans marteler Gemini
  const parts = await processWithConcurrency(
    chunks,
    4,
    (chunk) => withOneRetry(() => api.podcastTts(chunk, SPEAKERS)),
    onProgress,
  );
  return pcmToWavBlob(concatBytes(parts), 24000, 1);
}

function createBrowserPlayer(): PodcastPlayer {
  const hasWindow = typeof window !== 'undefined';
  return new PodcastPlayer({
    speech: hasWindow && 'speechSynthesis' in window ? window.speechSynthesis : null,
    createUtterance: (text) => new SpeechSynthesisUtterance(text),
    createAudio: () => {
      const a = new Audio();
      a.preload = 'auto';
      return a;
    },
    synthesizeHd,
    createObjectUrl: (b) => URL.createObjectURL(b),
    revokeObjectUrl: (u) => URL.revokeObjectURL(u),
    mediaSession: typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null,
    storage: hasWindow ? window.localStorage : null,
  });
}

/** Instance unique : le mini-lecteur et la page Podcast pilotent la même lecture. */
export const player = createBrowserPlayer();

export function usePlayer() {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}

/** Titre/sous-titre affichés pour un épisode (lecteur, liste, écran verrouillé). */
export function episodeLabels(ep: Pick<PodcastEpisodeDto, 'createdAt' | 'categories'>) {
  return {
    title: `Brief du ${dayjs(ep.createdAt).format('D MMMM')}`,
    subtitle: ep.categories.join(' · '),
  };
}

export function toPlayerEpisode(ep: PodcastEpisodeDto): PlayerEpisode {
  return { id: ep.id, script: ep.script, ...episodeLabels(ep) };
}
