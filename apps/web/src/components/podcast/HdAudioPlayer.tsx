import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, App as AntApp, Button, Space, Typography } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import { ApiError } from '@/services/api';
import { concatBytes, pcmToWavBlob, processWithConcurrency } from '@/lib/audio';
import { useObjectUrl } from '@/hooks/useObjectUrl';

/** Une nouvelle tentative pour un chunk, sauf erreur client (4xx : quota, lien expiré…). */
async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status !== null && e.status < 500) throw e;
    return fn();
  }
}

/**
 * Lecteur « voix HD » (Gemini TTS) : synthétise `chunkCount` chunks PCM
 * (4 en parallèle), les assemble en WAV et les joue dans un <audio>.
 * L'ObjectURL est révoquée à la régénération et au démontage.
 */
export function HdAudioPlayer({
  chunkCount,
  fetchChunk,
  hint,
  errorHelp,
  footer,
}: {
  chunkCount: number;
  fetchChunk: (index: number) => Promise<Uint8Array>;
  hint: ReactNode;
  errorHelp?: ReactNode;
  footer?: ReactNode;
}) {
  const { message } = AntApp.useApp();
  const [blobUrl, setBlob] = useObjectUrl();
  const [synthesizing, setSynthesizing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function synthesize() {
    setSynthesizing(true);
    setError(null);
    try {
      if (chunkCount <= 0) throw new Error('Script vide.');
      const indexes = Array.from({ length: chunkCount }, (_, i) => i);
      // 4 chunks en parallèle — gain ~3-4× vs séquentiel, sans marteler Gemini
      const parts = await processWithConcurrency(
        indexes,
        4,
        (index) => withOneRetry(() => fetchChunk(index)),
        (done, total) => {
          if (mounted.current) setProgressText(`Synthèse vocale ${done}/${total}…`);
        },
      );
      if (!mounted.current) return;
      setBlob(pcmToWavBlob(concatBytes(parts), 24000, 1));
      message.success('Audio HD prêt.');
    } catch (e) {
      if (mounted.current) setError((e as Error).message || 'Erreur de synthèse vocale.');
    } finally {
      if (mounted.current) {
        setSynthesizing(false);
        setProgressText('');
      }
    }
  }

  if (blobUrl) {
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <audio src={blobUrl} controls preload="auto" style={{ width: '100%' }} />
        <Space wrap>
          <Button size="small" onClick={() => setBlob(null)}>
            Régénérer
          </Button>
          {footer}
        </Space>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space wrap>
        <Button type="primary" icon={<SoundOutlined />} loading={synthesizing} onClick={synthesize}>
          <span className="tabular-nums">
            {synthesizing ? progressText || 'Synthèse en cours…' : 'Générer audio HD'}
          </span>
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {hint}
        </Typography.Text>
      </Space>
      {error && (
        <Alert
          type="error"
          showIcon
          message="Échec de la synthèse"
          description={
            errorHelp ? (
              <>
                {error}
                <br />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {errorHelp}
                </Typography.Text>
              </>
            ) : (
              error
            )
          }
        />
      )}
    </Space>
  );
}
