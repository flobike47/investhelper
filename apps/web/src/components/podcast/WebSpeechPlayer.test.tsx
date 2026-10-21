import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
import { WebSpeechPlayer } from './WebSpeechPlayer';

/** Faux moteur Web Speech : jsdom n'implémente pas speechSynthesis. */
class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const VOICES = [
  { name: 'Thomas', lang: 'fr-FR' },
  { name: 'Amélie', lang: 'fr-CA' },
  { name: 'Alex', lang: 'en-US' },
] as SpeechSynthesisVoice[];

function installFakeSpeech() {
  const listeners = new Set<() => void>();
  const synth = {
    speak: vi.fn<(u: FakeUtterance) => void>(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => VOICES,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { synth, fireVoicesChanged: () => listeners.forEach((l) => l()) };
}

const SCRIPT = 'Alex: Bonjour à tous. Sophie: Aujourd’hui on parle des marchés.';
const lastSpoken = (synth: ReturnType<typeof installFakeSpeech>['synth']) =>
  synth.speak.mock.calls.at(-1)?.[0] as FakeUtterance;

describe('WebSpeechPlayer', () => {
  let fake: ReturnType<typeof installFakeSpeech>;
  beforeEach(() => {
    fake = installFakeSpeech();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ne coupe pas la lecture au re-render ni au rechargement des voix', () => {
    const { rerender } = renderWithProviders(<WebSpeechPlayer script={SCRIPT} />);
    fireEvent.click(screen.getByRole('button', { name: /Écouter/ }));
    expect(fake.synth.speak).toHaveBeenCalledTimes(1);
    expect(lastSpoken(fake.synth).voice?.name).toBe('Thomas');
    const cancels = fake.synth.cancel.mock.calls.length;

    rerender(<WebSpeechPlayer script={SCRIPT} />);
    act(() => fake.fireVoicesChanged());

    expect(fake.synth.cancel).toHaveBeenCalledTimes(cancels);
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument();
  });

  it('enchaîne les passages à la fin de chaque énoncé', () => {
    renderWithProviders(<WebSpeechPlayer script={'Phrase une. '.repeat(30)} />);
    fireEvent.click(screen.getByRole('button', { name: /Écouter/ }));
    const first = lastSpoken(fake.synth);
    act(() => first.onend?.());
    expect(fake.synth.speak).toHaveBeenCalledTimes(2);
    expect(lastSpoken(fake.synth)).not.toBe(first);
  });

  it('changer de voix pendant la lecture relit le passage courant avec la nouvelle voix', () => {
    renderWithProviders(<WebSpeechPlayer script={SCRIPT} />);
    fireEvent.click(screen.getByRole('button', { name: /Écouter/ }));
    const before = lastSpoken(fake.synth);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Voix de lecture' }));
    fireEvent.click(screen.getByTitle('Amélie (fr-CA)'));

    const after = lastSpoken(fake.synth);
    expect(after).not.toBe(before);
    expect(after.voice?.name).toBe('Amélie');
    expect(after.text).toBe(before.text);
    // L'énoncé annulé ne fait pas avancer la lecture
    act(() => before.onend?.());
    expect(fake.synth.speak).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument();
  });

  it('coupe la synthèse au démontage seulement si ce lecteur parle', () => {
    const idle = renderWithProviders(<WebSpeechPlayer script={SCRIPT} />);
    idle.unmount();
    expect(fake.synth.cancel).not.toHaveBeenCalled();

    const playing = renderWithProviders(<WebSpeechPlayer script={SCRIPT} />);
    fireEvent.click(screen.getByRole('button', { name: /Écouter/ }));
    fake.synth.cancel.mockClear();
    playing.unmount();
    expect(fake.synth.cancel).toHaveBeenCalledTimes(1);
  });
});
