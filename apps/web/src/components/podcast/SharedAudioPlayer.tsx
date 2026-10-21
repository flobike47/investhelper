import { useState } from 'react';
import { Segmented, Space } from 'antd';
import { api } from '@/services/api';
import { WebSpeechPlayer } from './WebSpeechPlayer';
import { HdAudioPlayer } from './HdAudioPlayer';

type Mode = 'webspeech' | 'hd';

/**
 * Variante du AudioPlayer pour la page publique /share/:token.
 * Pour la voix HD, le découpage est fait par le serveur : on demande les
 * chunks 0..ttsChunkCount-1 via `api.sharedPodcastTts(token, index)`.
 */
export function SharedAudioPlayer({
  script,
  token,
  ttsChunkCount,
}: {
  script: string;
  token: string;
  ttsChunkCount: number;
}) {
  const [mode, setMode] = useState<Mode>('webspeech');

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Segmented<Mode>
        value={mode}
        onChange={(v) => setMode(v)}
        options={[
          { label: 'Voix navigateur (gratuit)', value: 'webspeech' },
          { label: 'Voix HD radio', value: 'hd' },
        ]}
      />
      {mode === 'webspeech' ? (
        <WebSpeechPlayer script={script} />
      ) : (
        <HdAudioPlayer
          chunkCount={ttsChunkCount}
          fetchChunk={(index) => api.sharedPodcastTts(token, index)}
          hint="~ 30-60 s la première fois, puis instant grâce au cache"
        />
      )}
    </Space>
  );
}
