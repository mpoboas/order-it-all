'use client';

import { useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import {
    registerServiceWorker,
    subscribeToPushNotifications,
    handlePushSubscriptionChange,
} from '@/lib/notifications';

export default function PushNotificationManager() {
    const { isLoggedIn } = useUser();

    useEffect(() => {
        if (isLoggedIn) {
            // Regista o SW e — só se a permissão já tiver sido concedida antes —
            // garante que a subscrição está sincronizada com a BD (idempotente).
            // NÃO pede permissão aqui: `Notification.requestPermission()` sem
            // gesto do utilizador falha logo no iOS, e em todo o lado é má
            // prática (queima o prompt nativo, que só se pode mostrar uma vez).
            // O pedido passa a viver num ecrã próprio (Fase 1).
            registerServiceWorker().then(() => {
                if (Notification.permission === 'granted') {
                    subscribeToPushNotifications();
                }
            });
        }
    }, [isLoggedIn]);

    // O `sw.js` não tem a chave VAPID (só existe no bundle da app) — quando
    // deteta que a subscrição do browser mudou sozinha, pede-nos por
    // `postMessage` para voltarmos a subscrever e gravar a nova.
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        const onMessage = (event: MessageEvent) => {
            if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
                void handlePushSubscriptionChange();
            }
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, []);

    return null; // Logic only component
}
