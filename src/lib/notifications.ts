import { pb } from '@/lib/pocketbase';

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
}

export async function subscribeToPushNotifications() {
  if (!PUBLIC_VAPID_KEY) {
    console.error('VAPID Public Key missing');
    return;
  }

  const registration = await navigator.serviceWorker.ready;

  // Check if already subscribed
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    // Ensure it's synced with DB (optional logic, usually we just assume it's good or update timestamp)
    await saveSubscriptionToDb(existingSubscription);
    return;
  }

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
    });

    await saveSubscriptionToDb(subscription);
    console.log('Push Subscribed:', subscription);
  } catch (error) {
    console.error('Failed to subscribe to push:', error);
  }
}

/**
 * A subscrição do browser pode rodar sozinha (renovação silenciosa, ou o
 * browser força uma nova) — o `sw.js` apanha isso no `pushsubscriptionchange`
 * mas não tem ali a chave VAPID (só existe no bundle da app), por isso avisa
 * as páginas abertas via `postMessage` e é aqui que se re-subscreve a sério.
 * Ver `PushNotificationManager.tsx` — é quem regista o listener da mensagem.
 */
export async function handlePushSubscriptionChange() {
  await subscribeToPushNotifications();
}

/**
 * Ao terminar sessão: apaga a linha em `push_subscriptions` (precisa da
 * autenticação atual — por isso corre ANTES do `usersApi.logout()`) e cancela
 * a subscrição no browser. Se o apagar falhar (ex.: a regra do PocketBase não
 * deixa o próprio utilizador apagar), a linha fica órfã mas autocura-se: o
 * `/api/notify` já apaga subscrições que devolvem 410/404 ao tentar enviar.
 */
export async function unsubscribeFromPushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    const user = pb.authStore.model;
    if (user) {
      try {
        const existing = await pb.collection('push_subscriptions').getList(1, 1, {
          filter: `user="${user.id}" && endpoint="${subscription.endpoint}"`,
        });
        if (existing.items.length > 0) {
          await pb.collection('push_subscriptions').delete(existing.items[0].id);
        }
      } catch (err) {
        console.error('Error removing subscription from PB:', err);
      }
    }

    await subscription.unsubscribe();
  } catch (err) {
    console.error('Error unsubscribing from push:', err);
  }
}

async function saveSubscriptionToDb(subscription: PushSubscription) {
  const user = pb.authStore.model;
  if (!user) return;

  const subscriptionJSON = subscription.toJSON();
  const endpoint = subscription.endpoint;

  try {
    // Check if this specific endpoint already exists (ignoring user to clear old potentially orphaned ones, or strictly by user)
    // Actually, one endpoint corresponds to one device+browser profile. It shouldn't change user owner normally, 
    // but if you log out and log in as someone else on same browser, filtering by endpoint is safer to find if it exists.
    
    // However, if multiple users use same device (rare for phone, possible for PC), the endpoint is same.
    // If we want to support multi-user on same device receiving notifs for their own stuff, we must map endpoint <-> user.
    // But usually we wipe sub on logout. 
    
    // Let's strict filter by USER + ENDPOINT to avoid duplicates for THIS user.
    const existing = await pb.collection('push_subscriptions').getList(1, 1, {
      filter: `user="${user.id}" && endpoint="${endpoint}"`,
    });

    if (existing.items.length === 0) {
      await pb.collection('push_subscriptions').create({
        user: user.id,
        endpoint: endpoint,
        keys: subscriptionJSON.keys,
      });
      console.log('New subscription saved to DB');
    } else {
        console.log('Subscription already exists in DB, skipping.');
    }
  } catch (err) {
    console.error('Error saving subscription to PB:', err);
  }
}

// Utility to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
