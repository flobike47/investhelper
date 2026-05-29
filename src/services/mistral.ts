import { createClient, ApiError } from './http';

const BASE_URL = 'https://api.mistral.ai/v1';

let cachedKey: string | null = null;
let cachedClient: ReturnType<typeof createClient> | null = null;

export function setMistralKey(key: string | null) {
  cachedKey = key;
  cachedClient = null;
}

function getClient() {
  if (!cachedClient) cachedClient = createClient(BASE_URL, 'Mistral');
  return cachedClient;
}

function requireKey(): string {
  const key = cachedKey || import.meta.env.VITE_MISTRAL_API_KEY;
  if (!key) {
    throw new ApiError(
      'Clé Mistral manquante. Renseigne-la dans Réglages ou dans .env (VITE_MISTRAL_API_KEY).',
      401,
      'Mistral',
    );
  }
  return key;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface ChatOpts {
  model?: 'mistral-small-latest' | 'mistral-large-latest';
  temperature?: number;
  jsonMode?: boolean;
}

export const mistral = {
  chat: async (messages: ChatMessage[], opts: ChatOpts = {}): Promise<string> => {
    const apiKey = requireKey();
    const res = await getClient().post<ChatCompletionResponse>(
      '/chat/completions',
      {
        model: opts.model ?? 'mistral-small-latest',
        messages,
        temperature: opts.temperature ?? 0.2,
        ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      },
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    return res.data.choices[0]?.message.content ?? '';
  },

  /** Helper that parses the model output as JSON, with a defensive fallback. */
  chatJson: async <T>(messages: ChatMessage[], opts: Omit<ChatOpts, 'jsonMode'> = {}): Promise<T> => {
    const raw = await mistral.chat(messages, { ...opts, jsonMode: true });
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Some models occasionally wrap JSON in prose; try to recover.
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as T;
      throw new ApiError('Réponse Mistral non parsable en JSON.', 500, 'Mistral');
    }
  },
};
