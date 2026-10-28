import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('../src/config.js', () => ({ config: { geminiKey: 'test-key' } }));
vi.mock('../src/providers/http.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/providers/http.js')>()),
  createProviderClient: () => ({ post: postMock }),
}));

const { gemini } = await import('../src/providers/gemini.js');

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({
    data: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('pcm').toString('base64') } }] } }] },
  });
});

describe('gemini.ttsMultiSpeaker', () => {
  it('précède la transcription d\'une consigne TTS nommant les locuteurs', async () => {
    // Sans consigne, certains extraits (citations, ton journalistique) sont pris
    // pour un prompt : Gemini répond 400 « Model tried to generate text ».
    const text = 'Alex: Bonjour.\nSophie: Bonjour Alex.';
    await gemini.ttsMultiSpeaker(text, { Alex: 'Charon', Sophie: 'Kore' });

    const body = postMock.mock.calls[0][1] as { contents: Array<{ parts: Array<{ text: string }> }> };
    expect(body.contents[0].parts[0].text).toBe(
      `TTS the following conversation between Alex and Sophie:\n${text}`,
    );
  });
});
