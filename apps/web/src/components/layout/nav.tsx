import type { ReactNode } from 'react';
import { AudioOutlined, BulbOutlined, LineChartOutlined, ReadOutlined } from '@ant-design/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Section active pour ce chemin (la fiche d'un actif reste dans sa section). */
  isActive: (pathname: string) => boolean;
}

/** Les 4 sections de l'app : barre d'onglets (mobile) et barre latérale (PC). */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Watchlist',
    icon: <LineChartOutlined />,
    isActive: (p) => p === '/' || p.startsWith('/asset/'),
  },
  { to: '/ideas', label: 'Idées', icon: <BulbOutlined />, isActive: (p) => p.startsWith('/ideas') },
  { to: '/podcast', label: 'Podcast', icon: <AudioOutlined />, isActive: (p) => p.startsWith('/podcast') },
  { to: '/news', label: 'Actualités', icon: <ReadOutlined />, isActive: (p) => p.startsWith('/news') },
];
