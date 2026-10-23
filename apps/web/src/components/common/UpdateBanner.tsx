import { Button, theme } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useUpdateAvailable } from '@/hooks/useUpdateAvailable';

/**
 * Bandeau « mise à jour disponible ». Jamais de rechargement automatique :
 * il couperait un podcast en cours. Après rechargement, les nouveautés
 * s'affichent (ReleaseNotesOnLaunch).
 */
export function UpdateBanner() {
  const available = useUpdateAvailable();
  const { token } = theme.useToken();
  if (!available) return null;

  return (
    <aside
      role="status"
      aria-label="Mise à jour disponible"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 8px 8px 14px',
        marginBottom: 16,
        borderRadius: 14,
        background: token.colorPrimaryBg,
        border: `1px solid ${token.colorPrimaryBorder}`,
        color: token.colorText,
      }}
    >
      <p style={{ margin: 0, flex: 1, fontSize: 14, lineHeight: 1.4 }}>Une mise à jour est disponible.</p>
      <Button type="primary" icon={<SyncOutlined />} onClick={() => window.location.reload()} style={{ minHeight: 40 }}>
        Recharger
      </Button>
    </aside>
  );
}
