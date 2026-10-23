import { useState, type ReactNode } from 'react';
import { Drawer, theme } from 'antd';
import { useSheetDrag } from '@/hooks/useSheetDrag';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/** Sous la barre d'état iOS, avec un liseré de la page derrière. */
const MAX_HEIGHT = 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)';
const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';

interface BottomSheetProps {
  open: boolean;
  /** Toute fermeture (croix, Échap, fond, glisser vers le bas) passe par ici. */
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  footer?: ReactNode;
  /** full : presque tout l'écran ; auto : hauteur du contenu, bornée à l'écran. */
  size?: 'full' | 'auto';
  closable?: boolean;
  'aria-label'?: string;
}

/**
 * Panneau qui monte du bas (mobile) et se ferme en le tirant vers le bas,
 * comme une feuille iOS. Le geste part de n'importe où sur le panneau ; dans
 * le corps, seulement quand il est défilé tout en haut (sinon il défile).
 */
export function BottomSheet({ open, onClose, children, title, footer, size = 'full', closable, 'aria-label': ariaLabel }: BottomSheetProps) {
  const { token } = theme.useToken();
  const reducedMotion = usePrefersReducedMotion();
  // État et non ref : le panneau n'est monté qu'à la première ouverture.
  const [sheet, setSheet] = useState<HTMLDivElement | null>(null);
  useSheetDrag(sheet, { open, onDismiss: onClose, reducedMotion });

  const full = size === 'full';
  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      height={full ? MAX_HEIGHT : 'auto'}
      title={title}
      footer={footer}
      closable={closable}
      aria-label={ariaLabel}
      // À l'intérieur du conteneur animé par antd : notre transform ne gêne
      // pas l'animation d'ouverture / fermeture.
      drawerRender={(node) => (
        <div ref={setSheet} style={{ height: '100%', position: 'relative' }}>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 36,
              height: 5,
              borderRadius: 3,
              background: token.colorFill,
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />
          {node}
        </div>
      )}
      styles={{
        // La hauteur max va sur `content` (colonne flex en-tête / corps / pied) :
        // le corps se réduit et défile, le pied reste visible. Sur `wrapper`,
        // le `height: 100%` du contenu ne se résolvait pas en hauteur auto.
        content: {
          maxHeight: full ? undefined : MAX_HEIGHT,
          borderRadius: '20px 20px 0 0',
          background: token.colorBgElevated,
        },
        header: { padding: '24px 20px 12px' },
        body: {
          padding: `${title ? 8 : 25}px 20px ${footer ? '16px' : `calc(24px + ${SAFE_BOTTOM})`}`,
          overscrollBehavior: 'contain',
        },
        footer: { padding: `12px 16px calc(12px + ${SAFE_BOTTOM})`, borderTop: 'none' },
      }}
    >
      {children}
    </Drawer>
  );
}
