import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Progress, Segmented, Select, Space, Tooltip, Typography, message } from 'antd';
import {
  PauseOutlined,
  CaretRightOutlined,
  StopOutlined,
  AudioOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { api } from '@/services/api';
import { concatBytes, pcmToWavBlob, splitDialogue } from '@/lib/audio';

const SPEAKERS: Record<string, string> = { Alex: 'Charon', Sophie: 'Kore' };

type Mode = 'webspeech' | 'hd';

export function AudioPlayer({ script }: { script: string }) {
  const [mode, setMode] = useState<Mode>('webspeech');

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
      {mode === 'webspeech' ? <WebSpeechPlayer script={script} /> : <HdPlayer script={script} />}
    </Space>
  );
}

// ---------- Lecteur Web Speech (système, gratuit) ----------

function WebSpeechPlayer({ script }: { script: string }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [chunkIndex, setChunkIndex] = useState(0);
  const chunks = useRef<string[]>(splitForTts(script));
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    chunks.current = splitForTts(script);
    setChunkIndex(0);
  }, [script]);

  useEffect(() => {
    function loadVoices() {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      if (!selectedVoice) {
        const fr = v.find((vo) => vo.lang.startsWith('fr'));
        if (fr) setSelectedVoice(fr.name);
      }
    }
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      window.speechSynthesis.cancel();
    };
  }, [selectedVoice]);

  function speakChunk(idx: number) {
    if (idx >= chunks.current.length) {
      setStatus('idle');
      setChunkIndex(0);
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks.current[idx]);
    u.lang = 'fr-FR';
    const voice = voices.find((v) => v.name === selectedVoice);
    if (voice) u.voice = voice;
    u.onend = () => {
      if (utteranceRef.current === u) {
        setChunkIndex(idx + 1);
        speakChunk(idx + 1);
      }
    };
    u.onerror = () => setStatus('idle');
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
  }

  const total = chunks.current.length || 1;
  const progress = Math.round((chunkIndex / total) * 100);
  const frenchVoices = voices.filter((v) => v.lang.startsWith('fr'));

  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      <Space wrap>
        {status === 'playing' ? (
          <Button icon={<PauseOutlined />} onClick={() => { window.speechSynthesis.pause(); setStatus('paused'); }}>
            Pause
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<CaretRightOutlined />}
            onClick={() => {
              if (status === 'paused') { window.speechSynthesis.resume(); setStatus('playing'); return; }
              setStatus('playing');
              speakChunk(chunkIndex);
            }}
          >
            {status === 'paused' ? 'Reprendre' : 'Écouter'}
          </Button>
        )}
        <Button
          icon={<StopOutlined />}
          disabled={status === 'idle'}
          onClick={() => { window.speechSynthesis.cancel(); utteranceRef.current = null; setChunkIndex(0); setStatus('idle'); }}
        >
          Stop
        </Button>
        {frenchVoices.length > 0 && (
          <Tooltip title="Voix système (qualité variable selon ton OS)">
            <Select
              prefix={<AudioOutlined />}
              size="small"
              value={selectedVoice ?? undefined}
              onChange={(v) => {
                window.speechSynthesis.cancel();
                setStatus('idle');
                setChunkIndex(0);
                setSelectedVoice(v);
              }}
              style={{ minWidth: 200 }}
              options={frenchVoices.map((v) => ({ label: `${v.name} (${v.lang})`, value: v.name }))}
            />
          </Tooltip>
        )}
      </Space>
      <Progress percent={progress} size="small" status={status === 'playing' ? 'active' : undefined} />
    </Space>
  );
}

// ---------- Lecteur HD (Gemini TTS multi-speaker) ----------

function HdPlayer({ script }: { script: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }, [script]);

  // Cleanup à l'unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function synthesize() {
    setSynthesizing(true);
    setError(null);
    try {
      const chunks = splitDialogue(script, 800);
      if (chunks.length === 0) throw new Error('Script vide.');
      const audioParts: Uint8Array[] = [];
      for (let i = 0; i < chunks.length; i++) {
        setProgressText(`Synthèse vocale ${i + 1}/${chunks.length}…`);
        const pcm = await api.podcastTts(chunks[i], SPEAKERS);
        audioParts.push(pcm);
      }
      const merged = concatBytes(audioParts);
      const wav = pcmToWavBlob(merged, 24000, 1);
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(wav);
      });
      message.success('Audio HD prêt.');
    } catch (e) {
      const msg = (e as Error).message || 'Erreur Gemini TTS';
      setError(msg);
    } finally {
      setSynthesizing(false);
      setProgressText('');
    }
  }

  if (blobUrl) {
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <audio src={blobUrl} controls preload="auto" style={{ width: '100%' }} />
        <Space>
          <Button size="small" onClick={() => { URL.revokeObjectURL(blobUrl); setBlobUrl(null); }}>
            Régénérer
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            Voix Alex (Charon) + Sophie (Kore) · 24 kHz
          </Typography.Text>
        </Space>
      </Space>
    );
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
          {synthesizing ? progressText || 'Synthèse en cours…' : 'Générer audio HD'}
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          ~ 30-60 s · Gemini TTS payant (~0,01 € l'épisode)
        </Typography.Text>
      </Space>
      {error && (
        <Alert
          type="error"
          showIcon
          message="Échec de la synthèse"
          description={
            <>
              {error}
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Si l'erreur mentionne "billing" ou "quota", il faut activer la
                facturation sur ta clé Gemini (AI Studio → Settings → Billing).
                Sinon, reste sur "Voix navigateur".
              </Typography.Text>
            </>
          }
        />
      )}
    </Space>
  );
}

function splitForTts(text: string, maxLen = 200): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length > maxLen && cur) {
      out.push(cur.trim());
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
