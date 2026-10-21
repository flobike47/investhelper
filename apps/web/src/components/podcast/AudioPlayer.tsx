import { useMemo, useState } from 'react';
import { Segmented, Space, Typography } from 'antd';
import { api } from '@/services/api';
import { splitDialogue } from '@/lib/audio';
import { WebSpeechPlayer } from './WebSpeechPlayer';
import { HdAudioPlayer } from './HdAudioPlayer';

const SPEAKERS: Record<string, string> = { Alex: 'Charon', Sophie: 'Kore' };

type Mode = 'webspeech' | 'hd';

/**
 * Lecteur d'un épisode (page privée). Un seul doit être monté à la fois :
 * `speechSynthesis` est global au navigateur.
 */
export function AudioPlayer({ script }: { script: string }) {
  const [mode, setMode] = useState<Mode>('webspeech');
  // Même découpage que le BFF (TTS_CHUNK_CHARS = 800) pour partager le cache TTS
  const ttsChunks = useMemo(() => splitDialogue(script, 800), [script]);

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Segmented<Mode>
        value={mode}
        onChange={(v) => setMode(v)}
        options={[
          { label: 'Voix navigateur (gratuit)', value: 'webspeech' },
          { label: 'Voix HD radio (Gemini TTS)', value: 'hd' },
        ]}
      />
      {mode === 'webspeech' ? (
        <WebSpeechPlayer script={script} />
      ) : (
        <HdAudioPlayer
          chunkCount={ttsChunks.length}
          fetchChunk={(i) => api.podcastTts(ttsChunks[i], SPEAKERS)}
          hint="~ 30-60 s · Gemini TTS payant (~0,01 € l'épisode)"
          errorHelp={
            <>
              Si l'erreur mentionne « billing » ou « quota », il faut activer la facturation sur ta
              clé Gemini (AI Studio → Settings → Billing). Sinon, reste sur « Voix navigateur ».
            </>
          }
          footer={
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Voix Alex (Charon) + Sophie (Kore) · 24 kHz
            </Typography.Text>
          }
        />
      )}
    </Space>
  );
}
