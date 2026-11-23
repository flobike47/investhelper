import { describe, expect, it } from 'vitest';
import { currentTopicIndex } from './topics';

describe('currentTopicIndex', () => {
  const topics = [
    { title: 'Intro', summary: '', category: null, startRatio: 0 },
    { title: 'Manifestations', summary: '', category: null, startRatio: 0.1 },
    { title: 'Nvidia', summary: '', category: null, startRatio: 275 / 729 },
  ];

  it('voix de l’appareil : le sujet est atteint dès que le passage en cours contient son début', () => {
    // Cas réel : seekTo(0.3772) sur 82 passages → passage 30, progress = 30/82 ≈ 0.366.
    expect(currentTopicIndex(topics, 30 / 82, 1 / 82)).toBe(2);
    expect(currentTopicIndex(topics, 29 / 82, 1 / 82)).toBe(1);
  });

  it('voix HD : comparaison directe avec la position continue', () => {
    expect(currentTopicIndex(topics, 275 / 729, 0)).toBe(2);
    expect(currentTopicIndex(topics, 0.37, 0)).toBe(1);
    expect(currentTopicIndex([], 0.5, 0)).toBe(-1);
  });
});
