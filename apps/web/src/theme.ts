import { theme as antdTheme, type ThemeConfig } from 'antd';

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

export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...sharedToken,
    colorBgBase: '#0b0d12',
    colorBgContainer: '#13161d',
    colorBgElevated: '#181c25',
    colorBgLayout: '#0b0d12',
  },
  components: {
    Layout: {
      bodyBg: '#0b0d12',
      headerBg: '#13161d',
      siderBg: '#0f1218',
    },
    Card: { colorBorderSecondary: '#1f242e' },
  },
};

export const lightTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: sharedToken,
};
