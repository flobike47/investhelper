import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Segmented, Space, Typography, message } from 'antd';
import {
  PauseOutlined,
  CaretRightOutlined,
  StopOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { api } from '@/services/api';
import { concatBytes, pcmToWavBlob, processWithConcurrency } from '@/lib/audio';

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
        <WebSpeech script={script} />
      ) : (
        <HdPlayer token={token} chunkCount={ttsChunkCount} />
      )}
    </Space>
  );
}

function WebSpeech({ script }: { script: string }) {
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  const handlePlay = () => {
    if (status === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
      return;
    }
    const u = new SpeechSynthesisUtterance(script);
    u.lang = 'fr-FR';
    u.onend = () => setStatus('idle');
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
    setStatus('playing');
  };

  return (
    <Space>
      {status === 'playing' ? (
        <Button
          icon={<PauseOutlined />}
          onClick={() => {
            window.speechSynthesis.pause();
            setStatus('paused');
          }}
        >
          Pause
        </Button>
      ) : (
        <Button type="primary" icon={<CaretRightOutlined />} onClick={handlePlay}>
          {status === 'paused' ? 'Reprendre' : 'Écouter'}
        </Button>
      )}
      <Button
        icon={<StopOutlined />}
        disabled={status === 'idle'}
        onClick={() => {
          window.speechSynthesis.cancel();
          setStatus('idle');
        }}
      >
        Stop
      </Button>
    </Space>
  );
}

function HdPlayer({ token, chunkCount }: { token: string; chunkCount: number }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  async function synthesize() {
    setSynthesizing(true);
    setError(null);
    try {
      if (chunkCount <= 0) throw new Error('Script vide.');
      const indexes = Array.from({ length: chunkCount }, (_, i) => i);
      const parts = await processWithConcurrency(
        indexes,
        4,
        (index) => api.sharedPodcastTts(token, index),
        (done, total) => setProgressText(`Synthèse ${done}/${total}…`),
      );
      const wav = pcmToWavBlob(concatBytes(parts), 24000, 1);
      setBlobUrl(URL.createObjectURL(wav));
      message.success('Audio HD prêt.');
    } catch (e) {
      setError((e as Error).message || 'Erreur synthèse');
    } finally {
      setSynthesizing(false);
      setProgressText('');
    }
  }

  if (blobUrl) {
    return <audio src={blobUrl} controls preload="auto" style={{ width: '100%' }} />;
  }

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space wrap>
        <Button
          type="primary"
          icon={<SoundOutlined />}
          loading={synthesizing}
          onClick={synthesize}
        >
          {synthesizing ? progressText : 'Générer audio HD'}
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          ~ 30-60 s la première fois, puis instant grâce au cache
        </Typography.Text>
      </Space>
      {error && <Alert type="error" showIcon message={error} />}
    </Space>
  );
}
