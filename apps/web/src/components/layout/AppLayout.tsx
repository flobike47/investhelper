import { useState } from 'react';
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Tag, Typography } from 'antd';
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
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useAuth } from '@/lib/auth';
import { HORIZONS } from '@/constants/horizons';

const { Sider, Header, Content } = Layout;
const { useBreakpoint } = Grid;

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
    <Space align="center" style={{ padding: '16px 20px' }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'linear-gradient(135deg, #22c55e, #3b82f6)',
          display: 'grid',
          placeItems: 'center',
          color: '#0b0d12',
          fontWeight: 800,
        }}
      >
        ih
      </div>
      {!compact && (
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const { horizon } = useUserSettings();
  const { user, signOut } = useAuth();
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Compte';

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
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider width={232} breakpoint="lg" style={{ borderRight: '1px solid #1f242e' }}>
          <Brand />
          {menu}
        </Sider>
      )}

      <Layout>
        <Header
          style={{
            padding: isMobile ? '0 12px' : '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1f242e',
          }}
        >
          <Space>
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
          <Space size={12}>
            <Tag color="green">Horizon : {HORIZONS[horizon].label}</Tag>
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
              <Avatar
                src={avatarUrl}
                icon={<UserOutlined />}
                style={{ cursor: 'pointer' }}
              />
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ padding: isMobile ? 16 : 24 }}>
          <Outlet />
        </Content>
      </Layout>

      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={260}
        styles={{ body: { padding: 0 } }}
      >
        <Brand />
        {menu}
      </Drawer>
    </Layout>
  );
}
