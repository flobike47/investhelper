import type { ReactNode } from 'react';
import { Button, Drawer, Modal, theme } from 'antd';
import { BugOutlined, PlusCircleOutlined, ToolOutlined } from '@ant-design/icons';
import type { Release } from '@/constants/releases';
import { formatReleaseDate } from '@/lib/releaseNotes';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useReleaseNotes } from '@/hooks/useReleaseNotes';

const SECTIONS: Array<{ key: 'added' | 'fixed' | 'improved'; label: string; icon: ReactNode }> = [
  { key: 'added', label: 'Ajouté', icon: <PlusCircleOutlined /> },
  { key: 'fixed', label: 'Corrigé', icon: <BugOutlined /> },
  { key: 'improved', label: 'Revu', icon: <ToolOutlined /> },
];

function ReleaseBody({ release, showDate }: { release: Release; showDate: boolean }) {
  const { token } = theme.useToken();
  return (
    <article aria-label={`Mise à jour du ${formatReleaseDate(release)}`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {showDate && (
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: token.colorTextSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {formatReleaseDate(release)}
        </h3>
      )}
      {SECTIONS.map(({ key, label, icon }) => {
        const lines = release[key];
        if (!lines?.length) return null;
        return (
          <section key={key} aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 650 }}>
              <span aria-hidden style={{ color: token.colorPrimary }}>
                {icon}
              </span>
              {label}
            </h4>
            <ul style={{ margin: 0, paddingLeft: 26, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.45 }}>
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </article>
  );
}

interface ReleaseNotesProps {
  releases: Release[];
  open: boolean;
  onClose: () => void;
  title?: string;
}

/**
 * Notes de mise à jour : feuille qui monte du bas sur mobile, fenêtre
 * centrée sur PC. Toute fermeture (bouton, croix, glisser, clic dehors)
 * passe par `onClose`.
 */
export function ReleaseNotes({ releases, open, onClose, title = 'Nouveautés' }: ReleaseNotesProps) {
  const isMobile = useIsMobile();
  const { token } = theme.useToken();
  if (releases.length === 0) return null;

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {releases.map((r) => (
        <ReleaseBody key={r.id} release={r} showDate={releases.length > 1} />
      ))}
    </div>
  );
  const subtitle = releases.length === 1 ? `Mise à jour du ${formatReleaseDate(releases[0])}` : null;
  const heading = (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span>{title}</span>
      {subtitle && <span style={{ fontSize: 13, fontWeight: 400, color: token.colorTextSecondary }}>{subtitle}</span>}
    </span>
  );
  const done = (
    <Button type="primary" size="large" block onClick={onClose}>
      C'est noté
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        placement="bottom"
        height="auto"
        title={heading}
        footer={done}
        styles={{
          // La hauteur max va sur `content` (colonne flex en-tête / corps / pied) :
          // le corps se réduit et défile, le bouton reste visible. Sur `wrapper`,
          // le `height: 100%` du contenu ne se résolvait pas (parent en
          // hauteur auto) : corps jamais borné, donc ni défilement ni bouton.
          content: { maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)', borderRadius: '16px 16px 0 0' },
          footer: { padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: 'none' },
        }}
      >
        {body}
      </Drawer>
    );
  }

  return (
    <Modal open={open} onCancel={onClose} title={heading} footer={done} width={520} centered>
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingTop: 8 }}>{body}</div>
    </Modal>
  );
}

/** Affiche une fois, à l'ouverture, les notes pas encore vues sur cet appareil. */
export function ReleaseNotesOnLaunch() {
  const { releases, open, dismiss } = useReleaseNotes();
  return <ReleaseNotes releases={releases} open={open} onClose={dismiss} />;
}
