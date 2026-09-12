'use client';

import { useCallback, useEffect, useState } from 'react';
import { registerServiceWorker, subscribeToPushNotifications } from '@/lib/notifications';
import { getOAuthBrowserPlatform, isStandalonePwa } from '@/lib/oauthBrowser';

export type PushSupportStatus = NotificationPermission | 'unsupported';

/**
 * Estado da permissão de push + o pedido em si, partilhado entre o cartão do
 * Perfil e o soft-ask de `/groups` (Fase 1/2 do plano de notificações — ver
 * memória `notificacoes-push`). Nunca chama `requestPermission()` sozinho —
 * só quando `requestPermission()` deste hook é chamado a partir de um toque.
 */
export function useNotificationPermission() {
  const [status, setStatus] = useState<PushSupportStatus>('unsupported');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported');
      return;
    }
    setStatus(Notification.permission);
  }, []);

  // No iOS, push só existe instalado no ecrã principal (`display-mode:
  // standalone`) — pedir a permissão sem isso não faz nada.
  const iosNeedsInstall =
    status === 'default' && getOAuthBrowserPlatform() === 'ios' && !isStandalonePwa();

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    const permission = await Notification.requestPermission();
    setStatus(permission);
    if (permission === 'granted') {
      await registerServiceWorker();
      await subscribeToPushNotifications();
    }
    return permission;
  }, []);

  return { status, iosNeedsInstall, requestPermission };
}
