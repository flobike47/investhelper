import { Tag } from 'antd';
import type { Signal } from '@/types/signals';

// Libellés d'indicateur, pas d'injonction : l'app ne donne pas de conseil
// en investissement, elle résume ce que disent les signaux techniques.
const CONFIG: Record<Signal, { color: string; label: string }> = {
  buy: { color: 'green', label: 'Signal haussier' },
  hold: { color: 'gold', label: 'Neutre' },
  sell: { color: 'red', label: 'Signal baissier' },
  unknown: { color: 'default', label: '—' },
};

export function SignalTag({ signal }: { signal: Signal }) {
  const c = CONFIG[signal];
  return <Tag color={c.color}>{c.label}</Tag>;
}
