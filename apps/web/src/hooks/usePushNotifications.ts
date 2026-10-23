import { useEffect, useMemo, useState } from 'react';
import { api } from '@/services/api';
import { deviceSubscription, disableDevicePush, enableDevicePush } from '@/services/push';
import { browserTimeZone, pushSupport, type PushSupport } from '@/lib/push';
import { useUserSettings } from './useUserSettings';

function currentPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission;
}

/**
 * Rappel quotidien du podcast : réglage serveur (activé, heure) + état de
 * l'appareil courant (support, permission, abonné ou non). L'option est
 * par compte ; l'abonnement, lui, est par appareil.
 */
export function usePushNotifications() {
  const settings = useUserSettings();
  const support: PushSupport = useMemo(() => pushSupport(navigator, window), []);
  const [permission, setPermission] = useState<NotificationPermission>(currentPermission);
  /** null tant qu'inconnu. */
  const [deviceSubscribed, setDeviceSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (support !== 'supported') return;
    let cancelled = false;
    deviceSubscription().then(
      (sub) => !cancelled && setDeviceSubscribed(sub !== null),
      () => !cancelled && setDeviceSubscribed(false),
    );
    return () => {
      cancelled = true;
    };
  }, [support]);

  /** Abonne cet appareil puis active l'option. Appeler depuis un clic. */
  const enable = async () => {
    setBusy(true);
    try {
      await enableDevicePush();
      setDeviceSubscribed(true);
      await settings.save({ podcastPushEnabled: true, timezone: browserTimeZone() });
    } finally {
      setPermission(currentPermission());
      setBusy(false);
    }
  };

  /** Désactive l'option et désabonne cet appareil. */
  const disable = async () => {
    setBusy(true);
    try {
      await settings.save({ podcastPushEnabled: false });
      // Best effort : l'option est coupée côté serveur, plus rien ne part
      await disableDevicePush().catch(() => undefined);
      setDeviceSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

  return {
    support,
    permission,
    deviceSubscribed,
    busy,
    enabled: settings.podcastPushEnabled,
    time: settings.podcastPushTime,
    enable,
    disable,
    setTime: (time: string) => settings.save({ podcastPushTime: time, timezone: browserTimeZone() }),
    sendTest: () => api.sendTestPush(),
  };
}
