// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PodcastPlayer, type PlayerDeps, type PlayerEpisode } from './player';
import { splitForTts } from './speech';

/** Faux moteur speechSynthesis : on termine les énoncés à la main. */
function fakeSpeech() {
  const spoken: { text: string; onend?: () => void }[] = [];
  const synth = {
    speak: vi.fn((u: { text: string; onend?: () => void }) => spoken.push(u)),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [{ lang: 'fr-FR', name: 'Thomas' }],
  };
  return { synth, spoken };
}

function fakeAudio() {
  const handlers: Record<string, () => void> = {};
  return {
    src: '',
    currentTime: 0,
    duration: 250,
    paused: true,
    play: vi.fn(async function (this: { paused: boolean }) {
      this.paused = false;
    }),
    pause: vi.fn(function (this: { paused: boolean }) {
      this.paused = true;
    }),
    addEventListener: (t: string, fn: () => void) => {
      handlers[t] = fn;
    },
    fire: (t: string) => handlers[t]?.(),
  };
}

// Deux passages : splitForTts coupe à ~200 caractères
const SCRIPT = `Alex: ${'Bonjour à tous, voici le point marché. '.repeat(5)}\nSophie: ${'Merci Alex, on commence. '.repeat(8)}`;
const EP: PlayerEpisode = { id: 'ep1', title: 'Brief du 21 octobre', subtitle: 'Macro', script: SCRIPT };

function setup(overrides: Partial<PlayerDeps> = {}) {
  const speech = fakeSpeech();
  const audio = fakeAudio();
  const store = new Map<string, string>();
  const deps: PlayerDeps = {
    speech: speech.synth as unknown as SpeechSynthesis,
    createUtterance: (text) => ({ text }) as unknown as SpeechSynthesisUtterance,
    createAudio: () => audio,
    synthesizeHd: vi.fn(async () => new Blob(['wav'])),
    createObjectUrl: vi.fn(() => 'blob:ep1'),
    revokeObjectUrl: vi.fn(),
    mediaSession: null,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    ...overrides,
  };
  return { player: new PodcastPlayer(deps), deps, speech, audio, store };
}

describe('PodcastPlayer — voix de l’appareil', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('lit les passages à la suite puis termine', () => {
    t.player.load(EP);
    const s = t.player.getState();
    expect(s.status).toBe('playing');
    expect(s.episode?.id).toBe('ep1');
    // Enchaînement : chaque fin d'énoncé lance le suivant
    while (t.player.getState().status === 'playing') {
      const last = t.speech.spoken[t.speech.spoken.length - 1];
      last.onend?.();
      if (t.speech.spoken.length > 20) throw new Error('boucle');
    }
    expect(t.player.getState().status).toBe('ended');
    expect(t.player.getState().progress).toBe(1);
    expect(t.speech.spoken.length).toBeGreaterThan(1);
  });

  it('pause puis reprise sans repartir du début', () => {
    t.player.load(EP);
    t.player.pause();
    expect(t.speech.synth.pause).toHaveBeenCalled();
    expect(t.player.getState().status).toBe('paused');
    t.player.play();
    expect(t.speech.synth.resume).toHaveBeenCalled();
    expect(t.player.getState().status).toBe('playing');
  });

  it('ignore la fin d’un énoncé annulé (changement d’épisode)', () => {
    t.player.load(EP);
    const first = t.speech.spoken[0];
    t.player.load({ ...EP, id: 'ep2' });
    const before = t.speech.spoken.length;
    first.onend?.(); // l'ancien énoncé se termine après coup
    expect(t.speech.spoken.length).toBe(before);
  });

  it('signale l’absence de synthèse vocale', () => {
    const p = setup({ speech: null }).player;
    p.load(EP);
    expect(p.getState().error).toMatch(/pas disponible/);
  });
});

describe('PodcastPlayer — voix HD', () => {
  it('synthétise une fois, joue, puis réutilise le WAV à la réécoute', async () => {
    const t = setup();
    t.player.setSource('hd');
    t.player.load(EP);
    expect(t.player.getState().status).toBe('loading');
    await vi.waitFor(() => expect(t.player.getState().status).toBe('playing'));
    expect(t.audio.src).toBe('blob:ep1');

    t.audio.currentTime = 102;
    t.audio.fire('timeupdate');
    expect(t.player.getState().position).toBe('1:42 / 4:10');

    t.player.load(EP);
    await vi.waitFor(() => expect(t.player.getState().status).toBe('playing'));
    expect(t.deps.synthesizeHd).toHaveBeenCalledTimes(1);
  });

  it('avance et recule de 15 s', async () => {
    const t = setup();
    t.player.setSource('hd');
    t.player.load(EP);
    await vi.waitFor(() => expect(t.player.getState().status).toBe('playing'));
    t.audio.currentTime = 100;
    t.player.skip(1);
    expect(t.audio.currentTime).toBe(115);
    t.player.skip(-1);
    t.player.skip(-1);
    expect(t.audio.currentTime).toBe(85);
  });

  it('affiche l’erreur de synthèse (ex. quota) et reste utilisable', async () => {
    const t = setup({ synthesizeHd: vi.fn(async () => Promise.reject(new Error('Quota dépassé'))) });
    t.player.setSource('hd');
    t.player.load(EP);
    await vi.waitFor(() => expect(t.player.getState().error).toBe('Quota dépassé'));
    expect(t.player.getState().status).toBe('idle');
  });

  it('une synthèse obsolète n’écrase pas l’épisode suivant', async () => {
    let resolveFirst!: (b: Blob) => void;
    const synth = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Blob>((r) => (resolveFirst = r)))
      .mockImplementation(async () => new Blob(['b']));
    const t = setup({ synthesizeHd: synth, createObjectUrl: vi.fn((b: Blob) => `blob:${b.size}`) });
    t.player.setSource('hd');
    t.player.load(EP);
    t.player.load({ ...EP, id: 'ep2' });
    await vi.waitFor(() => expect(t.player.getState().status).toBe('playing'));
    resolveFirst(new Blob(['longue réponse']));
    await Promise.resolve();
    expect(t.player.getState().episode?.id).toBe('ep2');
    expect(t.audio.src).toBe('blob:1');
  });

  it('mémorise la source choisie et libère les WAV à la fermeture', async () => {
    const t = setup();
    t.player.setSource('hd');
    expect(t.store.get('investhelper.playerSource')).toBe('hd');
    t.player.load(EP);
    await vi.waitFor(() => expect(t.player.getState().status).toBe('playing'));
    t.player.close();
    expect(t.deps.revokeObjectUrl).toHaveBeenCalledWith('blob:ep1');
    expect(t.player.getState().episode).toBeNull();
    expect(new PodcastPlayer(t.deps).getState().source).toBe('hd');
  });
});

describe('PodcastPlayer — seekTo', () => {
  const CHUNKS = splitForTts(SCRIPT);

  it('voix de l’appareil : va au passage floor(ratio × nombre de passages) et lit', () => {
    const t = setup();
    t.player.load(EP);
    t.player.pause();
    t.player.seekTo(0.5);
    expect(t.speech.spoken.at(-1)?.text).toBe(CHUNKS[Math.floor(0.5 * CHUNKS.length)]);
    expect(t.player.getState().status).toBe('playing');
  });

  it('voix de l’appareil : un ratio de 1 reste sur le dernier passage', () => {
    const t = setup();
    t.player.load(EP);
    t.player.seekTo(1);
    expect(t.speech.spoken.at(-1)?.text).toBe(CHUNKS[CHUNKS.length - 1]);
  });

  it('voix de l’appareil : charge un autre épisode directement à la bonne position', () => {
    const t = setup();
    t.player.seekTo(0.5, EP);
    expect(t.player.getState().episode?.id).toBe('ep1');
    expect(t.speech.spoken.at(-1)?.text).toBe(CHUNKS[Math.floor(0.5 * CHUNKS.length)]);
  });

  it('voix HD : place l’audio à ratio × durée une fois les métadonnées connues', async () => {
    const t = setup();
    t.player.setSource('hd');
    t.player.load(EP);
    await vi.waitFor(() => expect(t.player.getState().status).toBe('playing'));
    t.audio.fire('loadedmetadata');
    t.player.seekTo(0.4);
    expect(t.audio.currentTime).toBeCloseTo(100); // 0.4 × 250 s
    expect(t.player.getState().status).toBe('playing');
  });

  it('voix HD : mémorise la position si l’audio n’est pas encore chargé', async () => {
    const t = setup();
    t.player.setSource('hd');
    t.player.load(EP);
    await vi.waitFor(() => expect(t.player.getState().status).toBe('playing'));
    t.audio.currentTime = 0;
    t.player.seekTo(0.4);
    expect(t.audio.currentTime).toBe(0);
    t.audio.fire('loadedmetadata');
    expect(t.audio.currentTime).toBeCloseTo(100);
  });

  it('voix HD : charge l’épisode demandé puis se place à la position', async () => {
    const t = setup();
    t.player.setSource('hd');
    t.player.seekTo(0.5, EP);
    expect(t.player.getState().episode?.id).toBe('ep1');
    await vi.waitFor(() => expect(t.player.getState().status).toBe('playing'));
    t.audio.fire('loadedmetadata');
    expect(t.audio.currentTime).toBeCloseTo(125);
  });

  it('voix HD : ne relance pas une synthèse en cours (une seule facture)', async () => {
    const t = setup();
    t.player.setSource('hd');
    t.player.load(EP);
    expect(t.player.getState().status).toBe('loading');
    t.player.seekTo(0.5);
    await vi.waitFor(() => expect(t.player.getState().status).toBe('playing'));
    expect(t.deps.synthesizeHd).toHaveBeenCalledTimes(1);
  });

  it('borne un ratio hors de [0, 1]', () => {
    const t = setup();
    t.player.load(EP);
    t.player.seekTo(-3);
    expect(t.speech.spoken.at(-1)?.text).toBe(CHUNKS[0]);
    t.player.seekTo(42);
    expect(t.speech.spoken.at(-1)?.text).toBe(CHUNKS[CHUNKS.length - 1]);
  });
});
