import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Segmented, Space, Typography, message } from 'antd';
import {
  PauseOutlined,
  CaretRightOutlined,
  StopOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { api } from '@/services/api';
import { concatBytes, pcmToWavBlob, processWithConcurrency, splitDialogue } from '@/lib/audio';

const SPEAKERS: Record<string, string> = { Alex: 'Charon', Sophie: 'Kore' };

type Mode = 'webspeech' | 'hd';

/**
 * Variante du AudioPlayer pour la page publique /share/:token.
 * Identique en logique mais utilise `api.sharedPodcastTts(token, ...)`
 * au lieu de `api.podcastTts(...)` (qui exige une auth Supabase).
 */
export function SharedAudioPlayer({ script, token }: { script: string; token: string }) {
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
        <HdPlayer script={script} token={token} />
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

function HdPlayer({ script, token }: { script: string; token: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  async function synthesize() {
    setSynthesizing(true);
    setError(null);
    try {
      const chunks = splitDialogue(script, 800);
      if (chunks.length === 0) throw new Error('Script vide.');
      const parts = await processWithConcurrency(
        chunks,
        4,
        (chunk) => api.sharedPodcastTts(token, chunk, SPEAKERS),
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
