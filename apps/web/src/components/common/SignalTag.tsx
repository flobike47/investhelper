import { Tag } from 'antd';
import type { Signal } from '@/lib/scoring';

const CONFIG: Record<Signal, { color: string; label: string }> = {
  buy: { color: 'green', label: 'Acheter' },
  hold: { color: 'gold', label: 'Conserver' },
  sell: { color: 'red', label: 'Vendre' },
  unknown: { color: 'default', label: '—' },
};

export function SignalTag({ signal }: { signal: Signal }) {
  const c = CONFIG[signal];
  return <Tag color={c.color}>{c.label}</Tag>;
}
