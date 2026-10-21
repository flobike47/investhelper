import type { TickerSentiment } from '@/services/api';

type Sentiment = TickerSentiment['sentiment'];

/** Couleur de Tag antd par sentiment (presets, adaptés au thème clair et sombre). */
export const SENTIMENT_COLORS: Record<Sentiment, string> = {
  positive: 'green',
  negative: 'red',
  neutral: 'default',
  mixed: 'gold',
};

/** Libellé français du sentiment renvoyé par l'analyse IA. */
export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: 'Positif',
  negative: 'Négatif',
  neutral: 'Neutre',
  mixed: 'Mitigé',
};
