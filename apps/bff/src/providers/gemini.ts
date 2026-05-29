import { config } from '../config.js';
import { createProviderClient, ProviderError } from './http.js';

const client = createProviderClient('https://generativelanguage.googleapis.com/v1beta', 'Gemini');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

function key() {
  if (!config.geminiKey) throw new ProviderError('GEMINI_API_KEY non configurée', 503, 'Gemini');
  return config.geminiKey;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

interface TextOpts {
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxOutputTokens?: number;
}

async function generate(system: string | undefined, user: string, opts: TextOpts = {}): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
      ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const model = opts.model ?? DEFAULT_MODEL;
  const res = await client.post<GeminiResponse>(`/models/${model}:generateContent`, body, {
    params: { key: key() },
  });
  if (res.data.promptFeedback?.blockReason) {
    throw new ProviderError(`Gemini blocked: ${res.data.promptFeedback.blockReason}`, 400, 'Gemini');
  }
  const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new ProviderError('Réponse Gemini vide.', 502, 'Gemini');
  return text;
}

export const gemini = {
  text: (system: string | undefined, user: string, opts?: TextOpts) =>
    generate(system, user, opts),

  json: async <T>(system: string | undefined, user: string, opts?: Omit<TextOpts, 'jsonMode'>): Promise<T> => {
    const raw = await generate(system, user, { ...opts, jsonMode: true });
    try { return JSON.parse(raw) as T; }
    catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as T;
      throw new ProviderError('Réponse Gemini non parsable en JSON.', 500, 'Gemini');
    }
  },

  /**
   * TTS multi-speaker. `speakers` : { 'Alex': 'Charon', 'Sophie': 'Kore' }.
   * Renvoie un Buffer de PCM brut (16-bit, 24kHz, mono).
   */
  ttsMultiSpeaker: async (text: string, speakers: Record<string, string>): Promise<Buffer> => {
    const speakerVoiceConfigs = Object.entries(speakers).map(([speaker, voiceName]) => ({
      speaker,
      voiceConfig: { prebuiltVoiceConfig: { voiceName } },
    }));
    const res = await client.post<GeminiResponse>(
      `/models/${TTS_MODEL}:generateContent`,
      {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } },
        },
      },
      { params: { key: key() } },
    );
    if (res.data.promptFeedback?.blockReason) {
      throw new ProviderError(`Gemini TTS blocked: ${res.data.promptFeedback.blockReason}`, 400, 'Gemini');
    }
    const inline = res.data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline?.data) throw new ProviderError('Réponse TTS Gemini vide.', 502, 'Gemini');
    return Buffer.from(inline.data, 'base64');
  },
};
