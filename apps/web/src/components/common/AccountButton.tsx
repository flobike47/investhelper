import { Avatar, theme } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/** Accès « Compte et réglages » : avatar en haut à droite des pages mobiles. */
export function AccountButton() {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  return (
    <Link
      to="/settings"
      aria-label="Compte et réglages"
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        display: 'grid',
        placeItems: 'center',
        background: token.colorFillTertiary,
        flex: '0 0 auto',
      }}
    >
      <Avatar size={36} src={avatarUrl} alt="" icon={<UserOutlined />} />
    </Link>
  );
}
