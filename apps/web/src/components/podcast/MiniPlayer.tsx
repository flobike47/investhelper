import { Button, theme } from 'antd';
import { CaretRightFilled, CloseOutlined, LoadingOutlined, PauseOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { player, usePlayer } from '@/hooks/usePlayer';

/** Pastille de l'app (vignette de l'épisode). */
function Artwork({ size }: { size: number }) {
  const { token } = theme.useToken();
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        background: token.colorPrimary,
        color: '#0b0d12',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: size * 0.38,
        flex: '0 0 auto',
      }}
    >
      ih
    </span>
  );
}

/**
 * Lecteur réduit, visible sur toutes les pages tant qu'un épisode est chargé :
 * flottant au-dessus de la barre d'onglets (mobile) ou en bas de la barre
 * latérale (PC). Toucher le titre ouvre la page Podcast.
 */
export function MiniPlayer({ variant }: { variant: 'floating' | 'sidebar' }) {
  const s = usePlayer();
  const { token } = theme.useToken();
  if (!s.episode) return null;

  const playing = s.status === 'playing';
  const loading = s.status === 'loading';
  const floating = variant === 'floating';
  const detail = loading ? s.loadingText : s.error ?? s.position;

  return (
    <section
      aria-label="Lecteur podcast"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: floating ? '0 4px 0 10px' : 10,
        height: floating ? 60 : undefined,
        borderRadius: floating ? 16 : 14,
        overflow: 'hidden',
        background: floating
          ? `color-mix(in srgb, ${token.colorBgElevated} 82%, transparent)`
          : token.colorBgContainer,
        backdropFilter: floating ? 'blur(24px) saturate(180%)' : undefined,
        WebkitBackdropFilter: floating ? 'blur(24px) saturate(180%)' : undefined,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: floating ? '0 8px 24px rgba(0,0,0,0.28)' : undefined,
      }}
    >
      <Link
        to="/podcast"
        aria-label={`${s.episode.title} — ouvrir le podcast`}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, color: 'inherit' }}
      >
        <Artwork size={floating ? 36 : 32} />
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {s.episode.title}
          </span>
          <span
            className="tabular-nums"
            style={{
              fontSize: 12,
              color: s.error ? token.colorErrorText : token.colorTextSecondary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {detail || s.episode.subtitle}
          </span>
        </span>
      </Link>
      <Button
        type="text"
        shape="circle"
        size="large"
        aria-label={playing ? 'Pause' : 'Lecture'}
        disabled={loading}
        icon={loading ? <LoadingOutlined /> : playing ? <PauseOutlined /> : <CaretRightFilled />}
        onClick={() => player.toggle()}
        style={{ width: 44, height: 44 }}
      />
      <Button
        type="text"
        shape="circle"
        aria-label="Fermer le lecteur"
        icon={<CloseOutlined />}
        onClick={() => player.close()}
        style={{ width: 44, height: 44, color: token.colorTextSecondary }}
      />
      <span
        aria-hidden
        style={{ position: 'absolute', left: 12, right: 12, bottom: 0, height: 2, background: token.colorFillSecondary }}
      >
        <span style={{ display: 'block', height: 2, width: `${Math.round(s.progress * 100)}%`, background: token.colorPrimary }} />
      </span>
    </section>
  );
}
