import axios, { AxiosError, type AxiosInstance } from 'axios';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public provider?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createClient(baseURL: string, provider: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    // Pas de timeout : certains appels (Gemini TTS) peuvent prendre 30-60s
    // par segment. On préfère laisser pendre que de couper prématurément.
    timeout: 0,
  });

  client.interceptors.response.use(
    (res) => res,
    (err: AxiosError<{ error?: string; message?: string }>) => {
      const status = err.response?.status;
      const data = err.response?.data;
      const msg =
        data?.error ||
        data?.message ||
        err.message ||
        'Erreur réseau';
      return Promise.reject(new ApiError(msg, status, provider));
    },
  );

  return client;
}
