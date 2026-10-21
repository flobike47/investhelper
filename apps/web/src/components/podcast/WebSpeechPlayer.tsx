import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Progress, Select, Space, Tooltip, Typography } from 'antd';
import { AudioOutlined, CaretRightOutlined, PauseOutlined, StopOutlined } from '@ant-design/icons';
import { splitForTts } from '@/lib/speech';

type Status = 'idle' | 'playing' | 'paused';

function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Lecteur Web Speech (voix système, gratuit). Le script est lu passage par
 * passage (voir `splitForTts`).
 *
 * `speechSynthesis` est un singleton global : ce composant ne l'annule que
 * lorsqu'il est lui-même en train de parler (stop, changement de voix,
 * démontage). Un seul lecteur doit être monté à la fois — c'est la page
 * appelante qui le garantit.
 */
export function WebSpeechPlayer({ script }: { script: string }) {
  const chunks = useMemo(() => splitForTts(script), [script]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [chunkIndex, setChunkIndex] = useState(0);
  // Énoncé en cours de ce lecteur (null = ce lecteur ne parle pas). Sert à
  // ignorer les événements d'un énoncé annulé et à savoir s'il faut couper.
  const session = useRef<{ utterance: SpeechSynthesisUtterance | null }>({ utterance: null });
  const supported = speechAvailable();

  // Chargement des voix : simple abonnement, ne coupe jamais la lecture
  useEffect(() => {
    if (!speechAvailable()) return;
    const synth = window.speechSynthesis;
    const load = () => {
      const list = synth.getVoices();
      setVoices(list);
      setSelectedVoice((prev) => prev ?? list.find((v) => v.lang.startsWith('fr'))?.name ?? null);
    };
    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, []);

  // Démontage : on ne coupe la synthèse que si c'est ce lecteur qui parle
  useEffect(() => {
    const s = session.current;
    return () => {
      if (s.utterance && speechAvailable()) {
        s.utterance = null;
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function speakFrom(idx: number, voiceName: string | null) {
    const synth = window.speechSynthesis;
    if (idx >= chunks.length) {
      session.current.utterance = null;
      setStatus('idle');
      setChunkIndex(0);
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[idx]);
    u.lang = 'fr-FR';
    const voice = voices.find((v) => v.name === voiceName);
    if (voice) u.voice = voice;
    u.onend = () => {
      if (session.current.utterance !== u) return;
      setChunkIndex(idx + 1);
      speakFrom(idx + 1, voiceName);
    };
    u.onerror = () => {
      if (session.current.utterance !== u) return;
      session.current.utterance = null;
      setStatus('idle');
    };
    session.current.utterance = u;
    synth.speak(u);
  }

  /** Interrompt l'énoncé en cours sans déclencher l'enchaînement (onend ignoré). */
  function interrupt() {
    session.current.utterance = null;
    window.speechSynthesis.cancel();
  }

  function play() {
    if (status === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
      return;
    }
    // Vide une éventuelle file laissée par une autre page
    window.speechSynthesis.cancel();
    setStatus('playing');
    speakFrom(chunkIndex, selectedVoice);
  }

  function stop() {
    interrupt();
    setChunkIndex(0);
    setStatus('idle');
  }

  function changeVoice(name: string) {
    setSelectedVoice(name);
    if (status === 'idle') return;
    // Relit le passage en cours avec la nouvelle voix, sans revenir au début
    interrupt();
    if (status === 'playing') speakFrom(chunkIndex, name);
    else setStatus('idle');
  }

  if (!supported) {
    return (
      <Alert
        type="info"
        showIcon
        message="La synthèse vocale n'est pas disponible dans ce navigateur. Utilise la voix HD."
      />
    );
  }

  const total = chunks.length || 1;
  const progress = Math.round((chunkIndex / total) * 100);
  const frenchVoices = voices.filter((v) => v.lang.startsWith('fr'));

  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      <Space wrap>
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
          <Button type="primary" icon={<CaretRightOutlined />} onClick={play}>
            {status === 'paused' || chunkIndex > 0 ? 'Reprendre' : 'Écouter'}
          </Button>
        )}
        <Button icon={<StopOutlined />} disabled={status === 'idle' && chunkIndex === 0} onClick={stop}>
          Stop
        </Button>
        {frenchVoices.length > 0 && (
          <Tooltip title="Voix système (qualité variable selon ton OS)">
            <Select
              aria-label="Voix de lecture"
              prefix={<AudioOutlined />}
              size="small"
              value={selectedVoice ?? undefined}
              onChange={changeVoice}
              style={{ minWidth: 200 }}
              options={frenchVoices.map((v) => ({ label: `${v.name} (${v.lang})`, value: v.name }))}
            />
          </Tooltip>
        )}
      </Space>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Progress
          percent={progress}
          size="small"
          status={status === 'playing' ? 'active' : undefined}
          showInfo={false}
          style={{ flex: 1, margin: 0 }}
          aria-label="Progression de la lecture"
        />
        <Typography.Text type="secondary" className="tabular-nums" style={{ fontSize: 12 }}>
          {Math.min(chunkIndex + 1, chunks.length)}/{chunks.length}
        </Typography.Text>
      </div>
    </Space>
  );
}
