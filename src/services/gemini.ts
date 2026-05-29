import { createClient, ApiError } from './http';
import { base64ToBytes } from '@/lib/audio';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

let cachedKey: string | null = null;
let cachedClient: ReturnType<typeof createClient> | null = null;

export function setGeminiKey(key: string | null) {
  cachedKey = key;
  cachedClient = null;
}

function getClient() {
  if (!cachedClient) cachedClient = createClient(BASE_URL, 'Gemini');
  return cachedClient;
}

function requireKey(): string {
  const key = cachedKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    throw new ApiError(
      'Clé Gemini manquante. Renseigne-la dans Réglages ou dans .env (VITE_GEMINI_API_KEY).',
      401,
      'Gemini',
    );
  }
  return key;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

interface GenerateOpts {
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxOutputTokens?: number;
}

interface GenerateInput {
  system?: string;
  user: string;
}

async function generate(input: GenerateInput, opts: GenerateOpts = {}): Promise<string> {
  const key = requireKey();
  const model = opts.model ?? DEFAULT_MODEL;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: input.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
      ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (input.system) {
    body.systemInstruction = { parts: [{ text: input.system }] };
  }

  const res = await getClient().post<GeminiResponse>(
    `/models/${model}:generateContent`,
    body,
    { params: { key } },
  );

  if (res.data.promptFeedback?.blockReason) {
    throw new ApiError(
      `Gemini a bloqué la requête : ${res.data.promptFeedback.blockReason}`,
      400,
      'Gemini',
    );
  }
  const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new ApiError('Réponse Gemini vide.', 502, 'Gemini');
  }
  return text;
}

export const gemini = {
  text: (input: GenerateInput, opts?: GenerateOpts) => generate(input, opts),

  json: async <T>(input: GenerateInput, opts?: Omit<GenerateOpts, 'jsonMode'>): Promise<T> => {
    const raw = await generate(input, { ...opts, jsonMode: true });
    try {
      return JSON.parse(raw) as T;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as T;
      throw new ApiError('Réponse Gemini non parsable en JSON.', 500, 'Gemini');
    }
  },

  /**
   * Synthèse vocale multi-speakers. `speakers` est un mapping
   * { 'Alex': 'Charon', 'Sophie': 'Kore' } : on associe un nom utilisé dans
   * le texte à une voix Gemini préconfigurée. Renvoie du PCM 16-bit, 24 kHz,
   * mono — à wrapper dans un WAV via `pcmToWavBlob` côté appelant.
   */
  ttsMultiSpeaker: async (
    text: string,
    speakers: Record<string, string>,
  ): Promise<Uint8Array> => {
    const key = requireKey();
    const speakerVoiceConfigs = Object.entries(speakers).map(([speaker, voiceName]) => ({
      speaker,
      voiceConfig: { prebuiltVoiceConfig: { voiceName } },
    }));

    interface TtsResponse {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
        };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
    }

    const res = await getClient().post<TtsResponse>(
      `/models/${TTS_MODEL}:generateContent`,
      {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } },
        },
      },
      { params: { key } },
    );

    if (res.data.promptFeedback?.blockReason) {
      throw new ApiError(
        `Gemini a bloqué la synthèse : ${res.data.promptFeedback.blockReason}`,
        400,
        'Gemini',
      );
    }
    const inline = res.data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline?.data) {
      throw new ApiError('Réponse TTS Gemini vide.', 502, 'Gemini');
    }
    return base64ToBytes(inline.data);
  },
};
