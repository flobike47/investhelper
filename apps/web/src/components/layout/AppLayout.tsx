import { Avatar, theme } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePlayer } from '@/hooks/usePlayer';
import { MiniPlayer } from '@/components/podcast/MiniPlayer';
import { ReleaseNotesOnLaunch } from '@/components/common/ReleaseNotes';
import { UpdateBanner } from '@/components/common/UpdateBanner';
import { NAV_ITEMS } from './nav';

// Zones sûres iOS (encoche, Dynamic Island, barre d'accueil). viewport-fit=cover
// est déclaré dans index.html, sinon ces valeurs valent 0.
const SAFE_TOP = 'env(safe-area-inset-top, 0px)';
const SAFE_RIGHT = 'env(safe-area-inset-right, 0px)';
const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';
const SAFE_LEFT = 'env(safe-area-inset-left, 0px)';

const TAB_BAR_HEIGHT = 56;
const MINI_PLAYER_HEIGHT = 60;

/**
 * Fine barre de progression pendant le chargement d'une page (chunks lazy) :
 * un trait juste sous la barre d'état (heure, batterie), pas un aplat dessous.
 */
function NavigationProgress() {
  const navigation = useNavigation();
  const { token } = theme.useToken();
  if (navigation.state === 'idle') return null;
  return (
    <div
      role="progressbar"
      aria-label="Chargement de la page"
      style={{
        position: 'fixed',
        top: SAFE_TOP,
        left: 0,
        right: 0,
        height: 2,
        background: token.colorPrimary,
        opacity: 0.8,
        zIndex: 1100,
      }}
    />
  );
}

function Brand() {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px' }}>
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #22c55e, #3b82f6)',
          color: '#0b0d12',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 14,
        }}
      >
        ih
      </span>
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: token.colorText }}>
        InvestHelper
      </span>
    </div>
  );
}

/** Barre d'onglets mobile : translucide, au-dessus de la barre d'accueil iOS. */
function TabBar() {
  const { pathname } = useLocation();
  const { token } = theme.useToken();
  return (
    <nav
      aria-label="Navigation principale"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        height: `calc(${TAB_BAR_HEIGHT}px + ${SAFE_BOTTOM})`,
        paddingBottom: SAFE_BOTTOM,
        paddingLeft: SAFE_LEFT,
        paddingRight: SAFE_RIGHT,
        display: 'grid',
        gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))`,
        background: `color-mix(in srgb, ${token.colorBgLayout} 78%, transparent)`,
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderTop: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              fontSize: 11,
              fontWeight: 600,
              color: active ? token.colorPrimaryText : token.colorTextSecondary,
            }}
          >
            <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar() {
  const { pathname } = useLocation();
  const { token } = theme.useToken();
  const { user } = useAuth();
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const settingsActive = pathname.startsWith('/settings');

  const rowStyle = (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minHeight: 40,
    padding: '0 10px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    color: active ? token.colorText : token.colorTextSecondary,
    background: active ? token.colorFillSecondary : 'transparent',
  });

  return (
    <aside
      style={{
        position: 'sticky',
        top: 0,
        height: '100dvh',
        width: 240,
        flex: '0 0 240px',
        boxSizing: 'border-box',
        padding: `calc(20px + ${SAFE_TOP}) 12px calc(16px + ${SAFE_BOTTOM}) calc(12px + ${SAFE_LEFT})`,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <Brand />
      <nav aria-label="Navigation principale" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined} style={rowStyle(active)}>
              <span aria-hidden style={{ fontSize: 18, color: active ? token.colorPrimary : 'inherit' }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div style={{ flex: 1 }} />
      <MiniPlayer variant="sidebar" />
      <Link
        to="/settings"
        aria-current={settingsActive ? 'page' : undefined}
        style={{ ...rowStyle(settingsActive), minHeight: 44 }}
      >
        <Avatar size={28} src={avatarUrl} alt="" icon={<UserOutlined />} />
        Compte et réglages
      </Link>
    </aside>
  );
}

export default function AppLayout() {
  const isMobile = useIsMobile();
  const { token } = theme.useToken();
  const { episode } = usePlayer();

  if (isMobile) {
    // Le contenu défile sous la barre d'onglets et le mini-lecteur : on réserve leur hauteur.
    const reserved = TAB_BAR_HEIGHT + (episode ? MINI_PLAYER_HEIGHT + 8 : 0) + 24;
    return (
      <div style={{ minHeight: '100dvh', background: token.colorBgLayout, overflowX: 'clip' }}>
        {/* App installée (barre d'état translucide) : le contenu qui défile ne
            doit pas passer sous l'heure et la batterie. Hauteur nulle hors PWA. */}
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: SAFE_TOP,
            zIndex: 1001,
            background: `color-mix(in srgb, ${token.colorBgLayout} 82%, transparent)`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        />
        <NavigationProgress />
        <main
          style={{
            padding: `calc(12px + ${SAFE_TOP}) calc(16px + ${SAFE_RIGHT}) calc(${reserved}px + ${SAFE_BOTTOM}) calc(16px + ${SAFE_LEFT})`,
          }}
        >
          <UpdateBanner />
          <Outlet />
        </main>
        {episode && (
          <div
            style={{
              position: 'fixed',
              zIndex: 1000,
              left: `calc(8px + ${SAFE_LEFT})`,
              right: `calc(8px + ${SAFE_RIGHT})`,
              bottom: `calc(${TAB_BAR_HEIGHT + 8}px + ${SAFE_BOTTOM})`,
            }}
          >
            <MiniPlayer variant="floating" />
          </div>
        )}
        <TabBar />
        <ReleaseNotesOnLaunch />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: token.colorBgLayout }}>
      <NavigationProgress />
      <Sidebar />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          padding: `calc(28px + ${SAFE_TOP}) calc(32px + ${SAFE_RIGHT}) calc(40px + ${SAFE_BOTTOM}) 32px`,
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <UpdateBanner />
          <Outlet />
        </div>
      </main>
      <ReleaseNotesOnLaunch />
    </div>
  );
}
