self.addEventListener('push', function (event) {
    if (!event.data) {
        console.log('Push event but no data');
        return;
    }

    const data = event.data.json();
    const { title, body, icon, url, tag } = data;

    const options = {
        body,
        icon: icon || '/android-chrome-192x192.png',
        badge: '/favicon-48x48.png',
        vibrate: [100, 50, 100],
        // Agrupa notificações sobre o mesmo destino (ex.: a mesma viagem) em vez
        // de as empilhar — a mais recente substitui a anterior. `renotify` faz
        // o telemóvel voltar a alertar (vibrar) mesmo ao substituir, para a
        // atualização não passar em silêncio.
        tag: tag || url || undefined,
        renotify: Boolean(tag || url),
        data: {
            url: url || '/',
        },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    // Handle click - open the specific URL
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            const url = event.notification.data.url;

            // If a window is already open with this URL, focus it
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === url && 'focus' in client) {
                    return client.focus();
                }
            }

            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

// A subscrição pode rodar sozinha (renovação do browser) sem nenhum evento
// `push` associado. Este SW estático não tem a chave pública VAPID (só existe
// no bundle da app, injetada via env var) para se poder re-subscrever aqui —
// por isso avisa as páginas abertas, que têm a chave e tratam de gravar a
// subscrição nova. Se não houver nenhuma página aberta neste preciso momento,
// a app volta a sincronizar sozinha da próxima vez que abrir (ver
// `PushNotificationManager.tsx`).
self.addEventListener('pushsubscriptionchange', function (event) {
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            clientList.forEach(function (client) {
                client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' });
            });
        })
    );
});
