/**
 * Helpers pour manipuler l'audio PCM brut renvoyé par Gemini TTS et le
 * transformer en WAV jouable directement par <audio>.
 *
 * Gemini renvoie du `audio/L16;codec=pcm;rate=24000` (PCM 16-bit signé,
 * little-endian, 24 kHz, mono).
 */

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Enveloppe un buffer PCM 16-bit mono dans les headers WAV (RIFF/WAVE).
 */
export function pcmToWavBlob(pcm: Uint8Array, sampleRate = 24000, numChannels = 1): Blob {
  const bytesPerSample = 2;
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                                    // sub-chunk size
  view.setUint16(20, 1, true);                                     // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true);          // block align
  view.setUint16(34, 16, true);                                    // bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, ascii: string) {
  for (let i = 0; i < ascii.length; i++) view.setUint8(offset + i, ascii.charCodeAt(i));
}

/**
 * Découpe un script de dialogue en chunks de taille bornée, sans couper
 * une réplique de hôte en plein milieu. Format attendu en entrée :
 *
 *   Alex: ...\n
 *   Sophie: ...\n
 *   Alex: ...\n
 *
 * Lignes qui ne commencent pas par "Alex:" ou "Sophie:" sont rattachées
 * à la dernière réplique.
 */
export function splitDialogue(script: string, maxCharsPerChunk = 800): string[] {
  const turns: string[] = [];
  let current = '';

  for (const rawLine of script.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(Alex|Sophie)\s*:/i.test(line)) {
      if (current) turns.push(current.trim());
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current) turns.push(current.trim());

  // Regroupe les répliques en chunks <= maxCharsPerChunk
  const chunks: string[] = [];
  let buffer = '';
  for (const t of turns) {
    if (buffer.length + t.length + 1 > maxCharsPerChunk && buffer) {
      chunks.push(buffer);
      buffer = t;
    } else {
      buffer = buffer ? `${buffer}\n${t}` : t;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}
