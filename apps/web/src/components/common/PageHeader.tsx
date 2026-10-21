import type { ReactNode } from 'react';
import { theme } from 'antd';
import { LeftOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useIsMobile } from '@/hooks/useIsMobile';
import { AccountButton } from './AccountButton';

/**
 * En-tête de page : petite ligne de contexte, grand titre, actions.
 * Sur mobile, l'avatar (accès au compte) est à droite ; sur PC il vit dans la
 * barre latérale.
 */
export function PageHeader({
  eyebrow,
  title,
  extra,
  back,
  showAccount = true,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  extra?: ReactNode;
  /** Lien « Retour » au-dessus du titre (écran poussé, ex. Réglages). */
  back?: { to: string; label: string };
  showAccount?: boolean;
}) {
  const isMobile = useIsMobile();
  const { token } = theme.useToken();

  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {back && (
        <Link
          to={back.to}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginLeft: -4,
            color: token.colorPrimaryText,
            fontSize: 16,
          }}
        >
          <LeftOutlined aria-hidden /> {back.label}
        </Link>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {eyebrow && (
            <span style={{ fontSize: 13, fontWeight: 500, color: token.colorTextSecondary }}>{eyebrow}</span>
          )}
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? 32 : 30,
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: token.colorText,
            }}
          >
            {title}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {extra}
          {isMobile && showAccount && <AccountButton />}
        </div>
      </div>
    </header>
  );
}
