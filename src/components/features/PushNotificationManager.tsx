'use client';

import { useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import { registerServiceWorker, subscribeToPushNotifications } from '@/lib/notifications';

export default function PushNotificationManager() {
    const { isLoggedIn } = useUser();

    useEffect(() => {
        if (isLoggedIn) {
            // Initialize Service Worker
            registerServiceWorker().then(() => {
                // Automatically ask for permission if not explicitly denied
                // Note: Browsers block this unless triggered by user interaction usually, 
                // but we can try checking permission state first.
                if (Notification.permission === 'default') {
                    // We could show a UI specific button here, but for "Auto" we assume the user understands
                    Notification.requestPermission().then(permission => {
                        if (permission === 'granted') {
                            subscribeToPushNotifications();
                        }
                    });
                } else if (Notification.permission === 'granted') {
                    subscribeToPushNotifications();
                }
            });
        }
    }, [isLoggedIn]);

    return null; // Logic only component
}
