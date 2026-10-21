import { describe, expect, it } from 'vitest';
import { splitForTts } from './speech';

describe('splitForTts', () => {
  it('regroupe les phrases sans dépasser la longueur maximale', () => {
    const text = 'Une phrase courte. Une autre phrase! Et une question ? Fin.';
    const chunks = splitForTts(text, 40);
    expect(chunks.every((c) => c.length <= 40)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
  });

  it('garde une phrase plus longue que la limite en un seul passage', () => {
    const long = 'a'.repeat(250) + '.';
    expect(splitForTts(long, 200)).toEqual([long]);
  });

  it('renvoie une liste vide pour un texte vide', () => {
    expect(splitForTts('   ')).toEqual([]);
  });
});
