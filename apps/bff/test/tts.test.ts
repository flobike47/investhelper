import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEAKERS, splitDialogue, validateSpeakers } from '../src/tts.js';
import { splitDialogue as webSplitDialogue } from '../../web/src/lib/audio.js';

describe('validateSpeakers', () => {
  it('renvoie les voix par défaut quand rien n’est fourni', () => {
    expect(validateSpeakers(undefined)).toEqual(DEFAULT_SPEAKERS);
    expect(validateSpeakers({})).toEqual(DEFAULT_SPEAKERS);
  });

  // Ces voix étaient acceptées par /podcast/tts mais refusées par la route
  // de partage (allowlists dupliquées et divergentes).
  it.each(['Zephyr', 'Leda', 'Umbriel', 'Alnilam'])('accepte la voix Gemini %s', (voice) => {
    expect(validateSpeakers({ Alex: voice })).toEqual({ Alex: voice });
  });

  it('refuse une voix inconnue', () => {
    expect(() => validateSpeakers({ Alex: 'Inconnue' })).toThrow(/Voix non supportée/);
  });

  it('refuse plus de 4 speakers', () => {
    const five = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((n) => [n, 'Kore']));
    expect(() => validateSpeakers(five)).toThrow(/Trop de speakers/);
  });

  it.each([[['Kore']], ['Kore'], [{ Alex: 42 }], [{ '1bad': 'Kore' }]])(
    'refuse une entrée mal formée (%j)',
    (input) => {
      expect(() => validateSpeakers(input)).toThrow();
    },
  );
});

describe('splitDialogue', () => {
  it('ne coupe jamais une réplique et respecte la taille max quand c’est possible', () => {
    const script = Array.from({ length: 30 }, (_, i) =>
      `${i % 2 ? 'Sophie' : 'Alex'}: réplique numéro ${i} ${'x'.repeat(60)}`,
    ).join('\n');
    const chunks = splitDialogue(script, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(300);
      expect(c).toMatch(/^(Alex|Sophie):/);
    }
    expect(chunks.join('\n').split('\n')).toHaveLength(30);
  });

  it('rattache les lignes de continuation à la réplique précédente', () => {
    expect(splitDialogue('Alex: début\nsuite\n\nSophie: ok')).toEqual(['Alex: début suite\nSophie: ok']);
  });

  it('renvoie un tableau vide pour un script vide', () => {
    expect(splitDialogue('  \n ')).toEqual([]);
  });

  // Le owner (front) et le lecteur public (serveur) doivent produire les mêmes
  // chunks, sinon ils ne partagent plus le cache TTS (= double facturation).
  it('produit exactement les mêmes chunks que la version front', () => {
    const script = [
      'Alex: Bonjour à tous, aujourd’hui on parle des marchés.',
      'Sophie: Oui, et le CAC 40 a fini en hausse.',
      'avec une suite sur une autre ligne',
      ...Array.from({ length: 40 }, (_, i) => `${i % 2 ? 'Alex' : 'Sophie'}: phrase ${i} ${'y'.repeat(i * 7)}`),
    ].join('\n');
    expect(splitDialogue(script)).toEqual(webSplitDialogue(script, 800));
  });
});
