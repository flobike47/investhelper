// @vitest-environment node
// (jsdom n'implémente pas Blob.arrayBuffer ; ce module n'a pas besoin du DOM)
import { describe, expect, it } from 'vitest';
import { concatBytes, pcmToWavBlob, processWithConcurrency } from './audio';

describe('pcmToWavBlob', () => {
  it('écrit un en-tête RIFF/WAVE PCM 16-bit mono 24 kHz valide', async () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0]);
    const blob = pcmToWavBlob(pcm, 24000, 1);
    const view = new DataView(await blob.arrayBuffer());
    const ascii = (o: number) => String.fromCharCode(...new Uint8Array(view.buffer, o, 4));

    expect(blob.type).toBe('audio/wav');
    expect(view.byteLength).toBe(44 + pcm.length);
    expect(ascii(0)).toBe('RIFF');
    expect(ascii(8)).toBe('WAVE');
    expect(view.getUint32(4, true)).toBe(36 + pcm.length);
    expect(view.getUint16(22, true)).toBe(1); // canaux
    expect(view.getUint32(24, true)).toBe(24000); // sample rate
    expect(view.getUint32(28, true)).toBe(48000); // byte rate
    expect(view.getUint16(34, true)).toBe(16); // bits
    expect(view.getUint32(40, true)).toBe(pcm.length);
  });
});

describe('concatBytes', () => {
  it('concatène dans l’ordre', () => {
    expect(concatBytes([new Uint8Array([1]), new Uint8Array([2, 3])])).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('processWithConcurrency', () => {
  it('préserve l’ordre des résultats et ne dépasse jamais la concurrence', async () => {
    let active = 0;
    let peak = 0;
    const progress: number[] = [];
    const delays = [30, 5, 20, 1, 10, 2];

    const out = await processWithConcurrency(
      delays,
      2,
      async (ms, i) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, ms));
        active--;
        return i;
      },
      (done) => progress.push(done),
    );

    expect(out).toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
