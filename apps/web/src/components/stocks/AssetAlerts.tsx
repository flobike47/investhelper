import { useState } from 'react';
import { App as AntApp, Button, InputNumber, theme } from 'antd';
import { BellOutlined, DeleteOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAlerts } from '@/hooks/useAlerts';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { formatNative } from '@/lib/currency';
import type { NewPriceAlert, PriceAlert } from '@/services/api';

const KIND_LABELS: Record<PriceAlert['kind'], string> = {
  price: 'Prix',
  stop: 'Stop',
  target: 'Objectif',
};

/**
 * Alertes push d'un actif : au stop et à l'objectif du plan, ou à un prix
 * libre. Les seuils sont dans la devise de cotation, comme le cours comparé
 * par le BFF.
 */
export function AssetAlerts({
  symbol,
  currency,
  price,
  stop,
  target,
}: {
  symbol: string;
  currency: string;
  /** Dernier cours, devise native. */
  price: number | null;
  stop: number | null;
  target: number | null;
}) {
  const { token } = theme.useToken();
  const { message } = AntApp.useApp();
  const { alerts, create, remove } = useAlerts(symbol);
  const push = usePushNotifications();
  const [custom, setCustom] = useState<number | null>(null);

  const fmt = (v: number) => formatNative(v, currency);
  const submit = (alert: Omit<NewPriceAlert, 'symbol'>) =>
    create.mutate(
      { symbol, ...alert },
      {
        onSuccess: () => message.success({ content: 'Alerte créée', duration: 1.2 }),
        onError: (e) => message.error(e.message || "Échec de la création de l'alerte."),
      },
    );
  const submitCustom = () => {
    if (custom === null || price === null) return;
    // Sens déduit du cours actuel : un seuil au-dessus alerte à la hausse.
    submit({ direction: custom > price ? 'above' : 'below', threshold: custom, kind: 'price' });
    setCustom(null);
  };

  const active = alerts.filter((a) => a.triggeredAt === null);
  const triggered = alerts.filter((a) => a.triggeredAt !== null);
  const hasStopAlert = active.some((a) => a.kind === 'stop');
  const hasTargetAlert = active.some((a) => a.kind === 'target');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {push.support !== 'supported' ? (
        <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
          {push.support === 'needs-install'
            ? "Pour recevoir les alertes, ajoute l'app à l'écran d'accueil."
            : 'Les notifications ne sont pas disponibles sur ce navigateur.'}
        </span>
      ) : (
        push.deviceSubscribed === false && (
          <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
            Active les notifications de cet appareil dans les <Link to="/settings">réglages</Link> pour recevoir les alertes.
          </span>
        )
      )}

      {(stop !== null || target !== null) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stop !== null && !hasStopAlert && (
            <Button icon={<BellOutlined />} loading={create.isPending} onClick={() => submit({ direction: 'below', threshold: stop, kind: 'stop' })}>
              Alerte au stop · {fmt(stop)}
            </Button>
          )}
          {target !== null && !hasTargetAlert && (
            <Button icon={<BellOutlined />} loading={create.isPending} onClick={() => submit({ direction: 'above', threshold: target, kind: 'target' })}>
              Alerte à l'objectif · {fmt(target)}
            </Button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <InputNumber<number>
          aria-label={`Prix d'alerte en ${currency}`}
          placeholder={`Prix (${currency})`}
          min={0.0001}
          step={1}
          inputMode="decimal"
          value={custom}
          onChange={setCustom}
          onPressEnter={submitCustom}
          style={{ flex: 1 }}
        />
        <Button onClick={submitCustom} disabled={custom === null || price === null} loading={create.isPending}>
          Créer
        </Button>
      </div>

      {active.length > 0 && (
        <ul aria-label="Alertes actives" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {active.map((a) => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
              <span className="tabular-nums">
                {KIND_LABELS[a.kind]} · {a.direction === 'above' ? 'au-dessus de' : 'en dessous de'} {formatNative(a.threshold, a.currency)}
              </span>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`Supprimer l'alerte ${KIND_LABELS[a.kind].toLowerCase()} à ${formatNative(a.threshold, a.currency)}`}
                onClick={() => remove.mutate(a.id, { onError: (e) => message.error(e.message) })}
              />
            </li>
          ))}
        </ul>
      )}
      {triggered.length > 0 && (
        <ul aria-label="Alertes déclenchées" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {triggered.slice(0, 3).map((a) => (
            <li key={a.id} className="tabular-nums" style={{ fontSize: 13, color: token.colorTextSecondary }}>
              {KIND_LABELS[a.kind]} {formatNative(a.threshold, a.currency)} · déclenchée le {dayjs(a.triggeredAt).format('D MMM à HH:mm')}
              {a.triggeredPrice !== null && ` (cours ${formatNative(a.triggeredPrice, a.currency)})`}
            </li>
          ))}
        </ul>
      )}
      <span style={{ fontSize: 12, color: token.colorTextTertiary }}>
        Vérifiées toutes les 5 minutes sur le dernier cours disponible (parfois différé hors États-Unis).
      </span>
    </div>
  );
}
