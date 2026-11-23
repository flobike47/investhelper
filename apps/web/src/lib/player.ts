/**
 * Lecteur podcast global : un seul épisode joue à la fois, quelle que soit la
 * page affichée (le mini-lecteur du layout et la page Podcast lisent le même
 * état). Moteur hors React, compatible `useSyncExternalStore`.
 *
 * Deux sources :
 *  - `speech` : synthèse vocale de l'appareil (gratuite), lue passage par passage ;
 *  - `hd`     : voix Gemini (payante), chunks synthétisés par le BFF puis
 *               assemblés en WAV et joués par un <audio> — qui continue
 *               écran verrouillé et expose les contrôles système (Media Session).
 *
 * Les dépendances navigateur sont injectables pour les tests.
 */
import { splitForTts } from './speech';
import { formatClock } from './format';

export type PlayerSource = 'speech' | 'hd';
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended';

export interface PlayerEpisode {
  id: string;
  title: string;
  subtitle: string;
  script: string;
}

export interface PlayerState {
  episode: PlayerEpisode | null;
  source: PlayerSource;
  status: PlayerStatus;
  /** Avancement 0..1. */
  progress: number;
  /**
   * Largeur d'un pas de lecture, en unités de `progress` : 1 / nb de passages
   * en voix de l'appareil (on lit passage par passage), 0 en voix HD (continu).
   * Le passage en cours couvre [progress, progress + step[.
   */
  step: number;
  /** Position lisible : « 1:42 / 4:10 » (HD) ou « Passage 3 / 12 » (appareil). */
  position: string;
  /** Message pendant la synthèse HD (« Synthèse 3/9… »). */
  loadingText: string | null;
  error: string | null;
}

interface AudioLike {
  src: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: string, fn: () => void) => void;
}

export interface PlayerDeps {
  speech: SpeechSynthesis | null;
  createUtterance: (text: string) => SpeechSynthesisUtterance;
  createAudio: () => AudioLike;
  /** Synthèse HD d'un script complet → blob WAV. */
  synthesizeHd: (script: string, onProgress: (done: number, total: number) => void) => Promise<Blob>;
  createObjectUrl: (b: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  mediaSession: MediaSession | null;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
}

const SOURCE_KEY = 'investhelper.playerSource';
const SKIP_SECONDS = 15;

const INITIAL: Omit<PlayerState, 'source'> = {
  episode: null,
  status: 'idle',
  progress: 0,
  step: 0,
  position: '',
  loadingText: null,
  error: null,
};

export class PodcastPlayer {
  private state: PlayerState;
  private listeners = new Set<() => void>();
  private chunks: string[] = [];
  private chunkIndex = 0;
  /** Énoncé en cours ; les événements d'un énoncé annulé sont ignorés. */
  private utterance: SpeechSynthesisUtterance | null = null;
  private audio: AudioLike | null = null;
  /** WAV déjà synthétisés, par épisode (évite de refacturer une réécoute). */
  private hdUrls = new Map<string, string>();
  /** Jeton de chargement : une synthèse HD obsolète ne doit rien écraser. */
  private loadToken = 0;
  /** Position HD (0..1) demandée avant que l'audio ait ses métadonnées. */
  private pendingHdRatio: number | null = null;
  /** Vrai une fois la durée du fichier courant connue (événement loadedmetadata). */
  private metaReady = false;

  constructor(private deps: PlayerDeps) {
    const saved = safeGet(deps.storage, SOURCE_KEY);
    this.state = { ...INITIAL, source: saved === 'hd' ? 'hd' : 'speech' };
  }

  // ---- store ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = () => this.state;

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  // ---- commandes ----

  /**
   * Charge un épisode et lance la lecture. Remplace l'épisode en cours.
   * `startRatio` (0..1) place la lecture à cette position du script.
   */
  load(episode: PlayerEpisode, startRatio?: number) {
    this.halt();
    this.chunks = splitForTts(episode.script);
    this.chunkIndex = 0;
    this.pendingHdRatio = null;
    if (startRatio !== undefined) {
      const r = clampRatio(startRatio);
      if (this.state.source === 'hd') this.pendingHdRatio = r;
      else this.chunkIndex = speechIndexFor(r, this.chunks.length);
    }
    this.set({ ...INITIAL, source: this.state.source, episode });
    this.updateMediaSession();
    this.play();
  }

  /**
   * Place la lecture à `ratio` (0..1) de l'épisode puis lit.
   * Avec `episode` différent de l'épisode courant, charge celui-ci à cette position.
   * Voix HD : position en secondes = ratio × durée (mémorisée si l'audio n'est pas prêt).
   * Voix de l'appareil : passage floor(ratio × nombre de passages).
   */
  seekTo(ratio: number, episode?: PlayerEpisode) {
    const r = clampRatio(ratio);
    if (episode && episode.id !== this.state.episode?.id) {
      this.load(episode, r);
      return;
    }
    if (!this.state.episode) return;

    if (this.state.source === 'hd') {
      this.pendingHdRatio = r;
      this.applyHdSeek();
      // Pendant une synthèse, la position est appliquée à la fin : ne pas relancer.
      if (this.state.status !== 'loading') this.play();
      return;
    }

    this.interruptSpeech();
    this.chunkIndex = speechIndexFor(r, this.chunks.length);
    // Repart d'un état propre : sans cela, play() reprendrait l'énoncé suspendu.
    this.set({ status: 'idle' });
    this.updateSpeechProgress();
    this.play();
  }

  setSource(source: PlayerSource) {
    if (source === this.state.source) return;
    safeSet(this.deps.storage, SOURCE_KEY, source);
    const wasActive = this.state.status === 'playing' || this.state.status === 'loading';
    this.halt();
    this.chunkIndex = 0;
    this.set({ source, status: 'idle', progress: 0, step: 0, position: '', error: null, loadingText: null });
    if (wasActive) this.play();
  }

  play() {
    const { episode, source, status } = this.state;
    if (!episode) return;
    if (source === 'speech') return this.playSpeech(status === 'paused');
    return void this.playHd(episode);
  }

  pause() {
    if (this.state.status !== 'playing') return;
    if (this.state.source === 'speech') this.deps.speech?.pause();
    else this.audio?.pause();
    this.set({ status: 'paused' });
  }

  toggle() {
    if (this.state.status === 'playing') this.pause();
    else this.play();
  }

  /** ±15 s en HD, passage précédent/suivant avec la voix de l'appareil. */
  skip(direction: 1 | -1) {
    if (!this.state.episode) return;
    if (this.state.source === 'hd' && this.audio) {
      const a = this.audio;
      a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + direction * SKIP_SECONDS));
      this.syncAudio();
      return;
    }
    const next = Math.max(0, Math.min(this.chunks.length - 1, this.chunkIndex + direction));
    this.chunkIndex = next;
    if (this.state.status === 'playing') {
      this.interruptSpeech();
      this.speakFrom(next);
    } else {
      this.updateSpeechProgress();
    }
  }

  /** Ferme le lecteur (mini-lecteur masqué). */
  close() {
    this.halt();
    this.chunks = [];
    this.pendingHdRatio = null;
    // Libère les WAV synthétisés (plusieurs Mo chacun)
    this.hdUrls.forEach((url) => this.deps.revokeObjectUrl(url));
    this.hdUrls.clear();
    if (this.audio) this.audio.src = '';
    this.set({ ...INITIAL, source: this.state.source });
    if (this.deps.mediaSession) this.deps.mediaSession.metadata = null;
  }

  // ---- voix de l'appareil ----

  private playSpeech(resume: boolean) {
    const synth = this.deps.speech;
    if (!synth) {
      this.set({ error: "La synthèse vocale n'est pas disponible sur cet appareil. Utilise la voix HD." });
      return;
    }
    if (resume) {
      synth.resume();
      this.set({ status: 'playing' });
      return;
    }
    if (this.chunkIndex >= this.chunks.length) this.chunkIndex = 0;
    synth.cancel(); // vide une éventuelle file laissée par un autre lecteur
    this.set({ status: 'playing', error: null });
    this.speakFrom(this.chunkIndex);
  }

  private speakFrom(idx: number) {
    const synth = this.deps.speech;
    if (!synth) return;
    if (idx >= this.chunks.length) {
      this.utterance = null;
      this.chunkIndex = 0;
      this.set({ status: 'ended', progress: 1, position: this.speechPosition(this.chunks.length) });
      return;
    }
    this.chunkIndex = idx;
    this.updateSpeechProgress();
    const u = this.deps.createUtterance(this.chunks[idx]);
    u.lang = 'fr-FR';
    const voice = synth.getVoices().find((v) => v.lang.startsWith('fr'));
    if (voice) u.voice = voice;
    u.onend = () => {
      if (this.utterance === u) this.speakFrom(idx + 1);
    };
    u.onerror = () => {
      if (this.utterance !== u) return;
      this.utterance = null;
      this.set({ status: 'paused' });
    };
    this.utterance = u;
    synth.speak(u);
  }

  private interruptSpeech() {
    this.utterance = null;
    this.deps.speech?.cancel();
  }

  private speechPosition(index: number) {
    return `Passage ${Math.min(index + 1, this.chunks.length)} / ${this.chunks.length}`;
  }

  private updateSpeechProgress() {
    const total = this.chunks.length || 1;
    this.set({ progress: this.chunkIndex / total, step: 1 / total, position: this.speechPosition(this.chunkIndex) });
  }

  // ---- voix HD ----

  private async playHd(episode: PlayerEpisode) {
    const audio = this.ensureAudio();
    const cached = this.hdUrls.get(episode.id);
    if (cached) {
      this.setAudioSrc(audio, cached);
      if (this.state.status === 'ended') audio.currentTime = 0;
      await this.startAudio(audio);
      return;
    }
    const token = ++this.loadToken;
    this.set({ status: 'loading', error: null, loadingText: 'Préparation de la voix HD…' });
    try {
      const blob = await this.deps.synthesizeHd(episode.script, (done, total) => {
        if (token === this.loadToken) this.set({ loadingText: `Synthèse vocale ${done}/${total}…` });
      });
      if (token !== this.loadToken) return; // épisode ou source changés entre-temps
      const url = this.deps.createObjectUrl(blob);
      this.hdUrls.set(episode.id, url);
      this.setAudioSrc(audio, url);
      this.set({ loadingText: null });
      await this.startAudio(audio);
    } catch (e) {
      if (token !== this.loadToken) return;
      this.set({
        status: 'idle',
        loadingText: null,
        error: (e as Error).message || 'Échec de la synthèse vocale HD.',
      });
    }
  }

  private async startAudio(audio: AudioLike) {
    this.applyHdSeek();
    try {
      await audio.play();
      this.set({ status: 'playing' });
    } catch {
      // iOS refuse play() hors geste utilisateur : l'utilisateur relance.
      this.set({ status: 'paused' });
    }
    this.syncAudio();
  }

  /** Change la source audio ; la durée n'est fiable qu'après loadedmetadata. */
  private setAudioSrc(audio: AudioLike, url: string) {
    if (audio.src === url) return;
    this.metaReady = false;
    audio.src = url;
  }

  /** Applique la position HD mémorisée dès que la durée du fichier courant est connue. */
  private applyHdSeek() {
    const a = this.audio;
    if (this.pendingHdRatio === null || !a || !this.metaReady) return;
    const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
    if (!d) return;
    a.currentTime = this.pendingHdRatio * d;
    this.pendingHdRatio = null;
    this.syncAudio();
  }

  private ensureAudio(): AudioLike {
    if (this.audio) return this.audio;
    const a = this.deps.createAudio();
    a.addEventListener('loadedmetadata', () => {
      this.metaReady = true;
      this.applyHdSeek();
    });
    a.addEventListener('timeupdate', () => this.syncAudio());
    a.addEventListener('ended', () => this.set({ status: 'ended', progress: 1 }));
    a.addEventListener('pause', () => {
      // Pause venue du système (écran verrouillé, appel entrant…)
      if (this.state.source === 'hd' && this.state.status === 'playing' && a.paused) {
        this.set({ status: 'paused' });
      }
    });
    a.addEventListener('play', () => {
      if (this.state.source === 'hd' && this.state.status === 'paused') this.set({ status: 'playing' });
    });
    this.audio = a;
    return a;
  }

  private syncAudio() {
    const a = this.audio;
    if (!a || this.state.source !== 'hd') return;
    const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
    this.set({
      progress: d ? a.currentTime / d : 0,
      step: 0,
      position: d ? `${formatClock(a.currentTime)} / ${formatClock(d)}` : '',
    });
  }

  /** Coupe toute lecture en cours (sans changer l'épisode affiché). */
  private halt() {
    this.loadToken++;
    this.interruptSpeech();
    this.audio?.pause();
  }

  // ---- contrôles système (écran verrouillé, casque, montre) ----

  private updateMediaSession() {
    const ms = this.deps.mediaSession;
    const ep = this.state.episode;
    if (!ms || !ep) return;
    try {
      ms.metadata = new MediaMetadata({ title: ep.title, artist: 'InvestHelper', album: ep.subtitle });
      ms.setActionHandler('play', () => this.play());
      ms.setActionHandler('pause', () => this.pause());
      ms.setActionHandler('seekbackward', () => this.skip(-1));
      ms.setActionHandler('seekforward', () => this.skip(1));
    } catch {
      /* Media Session partielle selon les navigateurs : non bloquant */
    }
  }
}

function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return 0;
  return Math.min(1, Math.max(0, r));
}

/** Index du passage couvrant la position `ratio` (0..1) sur `count` passages. */
function speechIndexFor(ratio: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.floor(ratio * count));
}

function safeGet(storage: PlayerDeps['storage'], key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: PlayerDeps['storage'], key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    /* navigation privée : préférence non persistée */
  }
}
