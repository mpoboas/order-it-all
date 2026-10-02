'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { registerServiceWorker, subscribeToPushNotifications } from '@/lib/notifications';
import { currentPushPermission, getPushSupport, type PushSupport } from '@/lib/pushSupport';

export type PushSupportStatus = NotificationPermission | 'unsupported';

export interface EnableResult {
  permission: NotificationPermission;
  /** Permissão dada E subscrição gravada no servidor. */
  subscribed: boolean;
}

function noopSubscribe() {
  return () => {};
}

const SERVER_SUPPORT: PushSupport = {
  platform: 'desktop',
  standalone: false,
  inAppBrowser: false,
  pushCapable: false,
  iosNeedsInstall: false,
};
let cachedSupport: PushSupport | null = null;
/** Estável entre renders (o `useSyncExternalStore` compara por referência). */
function supportSnapshot(): PushSupport {
  cachedSupport ??= getPushSupport();
  return cachedSupport;
}

/**
 * Estado da permissão de push + o pedido em si, partilhado entre o Perfil e o
 * `NotificationInstallPrompt`. Nunca chama `requestPermission()` sozinho —
 * só a partir de um toque (no iPhone, sem gesto, o pedido falha logo).
 */
export function useNotificationPermission() {
  const support = useSyncExternalStore(noopSubscribe, supportSnapshot, () => SERVER_SUPPORT);
  const initial = useSyncExternalStore<PushSupportStatus>(noopSubscribe, currentPushPermission, () => 'unsupported');
  const [decided, setDecided] = useState<NotificationPermission | null>(null);
  const status: PushSupportStatus = decided ?? initial;

  const requestPermission = useCallback(async (): Promise<EnableResult> => {
    const permission = await Notification.requestPermission();
    setDecided(permission);
    if (permission !== 'granted') return { permission, subscribed: false };
    await registerServiceWorker();
    return { permission, subscribed: await subscribeToPushNotifications() };
  }, []);

  return {
    status,
    support,
    /** iPhone/iPad no browser: tem de instalar no ecrã principal primeiro. */
    iosNeedsInstall: support.iosNeedsInstall,
    requestPermission,
  };
}
