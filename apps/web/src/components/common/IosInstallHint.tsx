import { useState } from 'react';
import { Button, theme } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { shouldShowIosInstallHint } from '@/lib/pwa';

const DISMISS_KEY = 'investhelper.iosInstallHintDismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Icône « Partager » d'iOS (carré + flèche vers le haut). */
function ShareGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-3px' }}>
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/**
 * Safari iOS n'a pas d'invite d'installation : on explique le geste
 * « Partager → Sur l'écran d'accueil ». Masqué une fois installée ou fermée.
 */
export function IosInstallHint() {
  const { token } = theme.useToken();
  const [visible, setVisible] = useState(
    () => typeof window !== 'undefined' && shouldShowIosInstallHint(navigator, window) && !readDismissed(),
  );
  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* navigation privée */
    }
    setVisible(false);
  };

  return (
    <aside
      aria-label="Installer l'application"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '12px 4px 12px 14px',
        borderRadius: 14,
        background: token.colorPrimaryBg,
        border: `1px solid ${token.colorPrimaryBorder}`,
        color: token.colorText,
      }}
    >
      <p style={{ margin: 0, flex: 1, fontSize: 14, lineHeight: 1.45 }}>
        <strong>Installer InvestHelper</strong> : touchez <ShareGlyph /> <em>Partager</em>, puis « Sur l'écran
        d'accueil ». L'app s'ouvrira en plein écran, comme une app native.
      </p>
      <Button type="text" shape="circle" aria-label="Masquer l'aide à l'installation" icon={<CloseOutlined />} onClick={dismiss} style={{ width: 44, height: 44 }} />
    </aside>
  );
}
