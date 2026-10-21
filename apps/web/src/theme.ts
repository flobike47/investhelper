import { theme as antdTheme, type ThemeConfig } from 'antd';

export type ThemeMode = 'dark' | 'light';

const sharedToken = {
  colorPrimary: '#22c55e',
  colorInfo: '#3b82f6',
  colorSuccess: '#22c55e',
  colorWarning: '#f59e0b',
  colorError: '#ef4444',
  borderRadius: 8,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

/**
 * Couleurs « hors antd » du document, par thème :
 *  - themeColor : barre d'état / chrome du navigateur mobile, alignée sur le
 *    fond du header (le haut de l'écran) ;
 *  - background : fond de <body>, visible lors du rebond de scroll iOS.
 * Doivent rester synchronisées avec les tokens ci-dessous et index.html.
 */
export const DOCUMENT_COLORS: Record<ThemeMode, { themeColor: string; background: string }> = {
  dark: { themeColor: '#13161d', background: '#0b0d12' },
  light: { themeColor: '#ffffff', background: '#f5f5f5' },
};

export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...sharedToken,
    colorBgBase: '#0b0d12',
    colorBgContainer: '#13161d',
    colorBgElevated: '#181c25',
    colorBgLayout: DOCUMENT_COLORS.dark.background,
    // Séparateurs discrets (header, sider, cartes) ; lu via theme.useToken().
    colorBorderSecondary: '#1f242e',
  },
  components: {
    Layout: {
      bodyBg: DOCUMENT_COLORS.dark.background,
      headerBg: DOCUMENT_COLORS.dark.themeColor,
      siderBg: '#0f1218',
    },
  },
};

export const lightTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    ...sharedToken,
    colorBgLayout: DOCUMENT_COLORS.light.background,
  },
  components: {
    // Par défaut antd peint header et sider en bleu nuit (#001529), illisible
    // avec un menu et des textes clairs : on les aligne sur les conteneurs.
    Layout: {
      bodyBg: DOCUMENT_COLORS.light.background,
      headerBg: DOCUMENT_COLORS.light.themeColor,
      siderBg: '#ffffff',
    },
  },
};

export function themeConfigFor(mode: ThemeMode): ThemeConfig {
  return mode === 'dark' ? darkTheme : lightTheme;
}

/** Paramètres de lib/documentTheme pour un thème donné. */
export function documentThemeFor(mode: ThemeMode) {
  return {
    mode,
    ...DOCUMENT_COLORS[mode],
    borderSecondary: antdTheme.getDesignToken(themeConfigFor(mode)).colorBorderSecondary,
  };
}
