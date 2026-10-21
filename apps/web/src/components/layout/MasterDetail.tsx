import type { ReactNode } from 'react';
import { theme } from 'antd';
import { useOutlet } from 'react-router-dom';
import { useIsMobile } from '@/hooks/useIsMobile';

/**
 * Liste + fiche. PC : la fiche (route enfant) occupe une colonne à droite,
 * avec un message tant qu'aucun élément n'est sélectionné. Mobile : la route
 * enfant s'affiche elle-même en panneau par-dessus la liste.
 */
export function MasterDetail({ children, placeholder }: { children: ReactNode; placeholder: string }) {
  const outlet = useOutlet();
  const isMobile = useIsMobile();
  const { token } = theme.useToken();

  if (isMobile) {
    return (
      <>
        {children}
        {outlet}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>{children}</div>
      <aside
        aria-label="Fiche"
        style={{
          flex: '0 0 400px',
          position: 'sticky',
          top: 24,
          maxHeight: 'calc(100dvh - 48px)',
          overflowY: 'auto',
          background: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 16,
          padding: 20,
        }}
      >
        {outlet ?? (
          <p style={{ margin: 0, padding: '48px 8px', textAlign: 'center', color: token.colorTextSecondary }}>{placeholder}</p>
        )}
      </aside>
    </div>
  );
}
