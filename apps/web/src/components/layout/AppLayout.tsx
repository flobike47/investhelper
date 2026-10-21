import { useState } from 'react';
import {
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  Menu,
  Space,
  Spin,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  DashboardOutlined,
  StarOutlined,
  RiseOutlined,
  GlobalOutlined,
  SettingOutlined,
  MenuOutlined,
  SoundOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigation } from 'react-router-dom';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useAuth } from '@/lib/auth';
import { HORIZONS } from '@/constants/horizons';

const { Sider, Header, Content } = Layout;
const { useBreakpoint } = Grid;

// Marges de sécurité iOS (encoche, Dynamic Island, barre d'accueil) :
// viewport-fit=cover est déclaré dans index.html, sinon ces valeurs valent 0.
const SAFE_TOP = 'env(safe-area-inset-top, 0px)';
const SAFE_RIGHT = 'env(safe-area-inset-right, 0px)';
const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';
const SAFE_LEFT = 'env(safe-area-inset-left, 0px)';
// Hauteur par défaut du Header antd (token Layout.headerHeight).
const HEADER_HEIGHT = 64;

const items = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Tableau de bord</Link> },
  { key: '/recommendations', icon: <RiseOutlined />, label: <Link to="/recommendations">Recommandations</Link> },
  { key: '/watchlist', icon: <StarOutlined />, label: <Link to="/watchlist">Watchlist</Link> },
  { key: '/news', icon: <GlobalOutlined />, label: <Link to="/news">Actualités</Link> },
  { key: '/podcast', icon: <SoundOutlined />, label: <Link to="/podcast">Podcast</Link> },
  { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Réglages</Link> },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Space align="center" style={{ padding: compact ? 0 : '16px 20px' }}>
      <div
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'linear-gradient(135deg, #22c55e, #3b82f6)',
          display: 'grid',
          placeItems: 'center',
          // Texte du logo : couleur de marque fixe, lisible sur le dégradé
          // dans les deux thèmes.
          color: '#0b0d12',
          fontWeight: 800,
        }}
      >
        ih
      </div>
      {compact ? (
        <span className="sr-only">InvestHelper</span>
      ) : (
        <Typography.Text strong style={{ fontSize: 16 }}>
          InvestHelper
        </Typography.Text>
      )}
    </Space>
  );
}

export default function AppLayout() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { token } = theme.useToken();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigation = useNavigation();
  const { horizon } = useUserSettings();
  const { user, signOut } = useAuth();
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Compte';
  const border = `1px solid ${token.colorBorderSecondary}`;
  const gutter = isMobile ? 12 : 24;
  const contentGutter = isMobile ? 16 : 24;

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      items={items}
      style={{ borderInlineEnd: 'none', background: 'transparent' }}
      onClick={() => setDrawerOpen(false)}
    />
  );

  return (
    // overflowX clip : dernier garde-fou contre un défilement horizontal de
    // toute la page (clip ne crée pas de conteneur de scroll, sticky intact).
    <Layout style={{ minHeight: '100dvh', overflowX: 'clip' }}>
      {!isMobile && (
        <Sider
          width={232}
          breakpoint="lg"
          style={{ borderRight: border, paddingTop: SAFE_TOP, paddingLeft: SAFE_LEFT }}
        >
          <Brand />
          {menu}
        </Sider>
      )}

      {/* minWidth 0 : un enfant large (tableau, graphique) ne peut pas
          élargir la colonne au-delà de l'écran. */}
      <Layout style={{ minWidth: 0 }}>
        <Header
          style={{
            height: `calc(${HEADER_HEIGHT}px + ${SAFE_TOP})`,
            paddingTop: SAFE_TOP,
            paddingLeft: isMobile ? `calc(${gutter}px + ${SAFE_LEFT})` : gutter,
            paddingRight: `calc(${gutter}px + ${SAFE_RIGHT})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            borderBottom: border,
          }}
        >
          <Space style={{ minWidth: 0 }}>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
                aria-label="Ouvrir le menu"
              />
            )}
            {isMobile && <Brand compact />}
          </Space>
          <Space size={12} style={{ flexShrink: 0 }}>
            {/* Pages en lazy : le routeur attend le chunk avant de naviguer,
                on signale donc que le clic a bien été pris en compte. */}
            {navigation.state !== 'idle' && <Spin size="small" aria-label="Chargement de la page" />}
            {/* Sous md, l'horizon reste visible dans Réglages : le header
                d'un écran de 360 px n'a pas la place pour ce tag. */}
            {!isMobile && <Tag color="green">Horizon : {HORIZONS[horizon].label}</Tag>}
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'name',
                    label: (
                      <div style={{ padding: '4px 0', maxWidth: 220 }}>
                        <Typography.Text strong style={{ display: 'block' }}>
                          {fullName}
                        </Typography.Text>
                        {user?.email && fullName !== user.email && (
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {user.email}
                          </Typography.Text>
                        )}
                      </div>
                    ),
                    disabled: true,
                  },
                  { type: 'divider' },
                  {
                    key: 'settings',
                    icon: <SettingOutlined />,
                    label: <Link to="/settings">Réglages</Link>,
                  },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Déconnexion',
                    danger: true,
                    onClick: () => signOut(),
                  },
                ],
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              {/* Vrai bouton : focusable au clavier, activable avec Entrée /
                  Espace, annoncé par les lecteurs d'écran. */}
              <Button
                type="text"
                shape="circle"
                aria-label="Menu du compte"
                aria-haspopup="menu"
                style={{ width: 40, height: 40, padding: 0 }}
              >
                <Avatar src={avatarUrl} alt="" icon={<UserOutlined />} />
              </Button>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            minWidth: 0,
            paddingTop: contentGutter,
            paddingRight: `calc(${contentGutter}px + ${SAFE_RIGHT})`,
            paddingBottom: `calc(${contentGutter}px + ${SAFE_BOTTOM})`,
            paddingLeft: isMobile ? `calc(${contentGutter}px + ${SAFE_LEFT})` : contentGutter,
          }}
        >
          <Outlet />
        </Content>
      </Layout>

      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={260}
        styles={{
          content: { paddingTop: SAFE_TOP, paddingLeft: SAFE_LEFT, paddingBottom: SAFE_BOTTOM },
          body: { padding: 0 },
        }}
      >
        <Brand />
        {menu}
      </Drawer>
    </Layout>
  );
}
