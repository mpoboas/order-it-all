import { registerAppServiceWorker } from '@/lib/serviceWorker';
import { authHeaders, pb } from '@/lib/pocketbase';

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    // Mesmo URL da casca offline (`SW_URL`) — registar outro script no mesmo
    // scope substituiria o SW ativo.
    return await registerAppServiceWorker();
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
}

/** A subscrição foi criada com esta chave VAPID? (Se a chave do servidor
 *  mudar, as subscrições antigas deixam de receber — é preciso refazê-las.) */
function sameServerKey(subscription: PushSubscription, key: Uint8Array<ArrayBuffer>): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true; // browser não expõe — assume que sim
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((byte, i) => byte === key[i]);
}

/**
 * Garante que este dispositivo está subscrito e gravado na conta atual.
 * Idempotente — corre em cada arranque com a permissão já dada. Devolve
 * `false` se algo falhou (sem chave VAPID, subscrição recusada, servidor em
 * baixo), para o ecrã não dizer "ativadas" quando não estão.
 */
export async function subscribeToPushNotifications(): Promise<boolean> {
  if (!PUBLIC_VAPID_KEY) {
    console.error('VAPID Public Key missing');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const serverKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);

    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameServerKey(subscription, serverKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey,
    });

    return await saveSubscription(subscription);
  } catch (error) {
    console.error('Failed to subscribe to push:', error);
    return false;
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
 * Ao terminar sessão: apaga a linha deste dispositivo (precisa da sessão
 * atual — por isso corre ANTES do `usersApi.logout()`) e cancela a subscrição
 * no browser. Se o apagar falhar, a linha fica órfã mas não faz mal: quem
 * entrar a seguir neste dispositivo fica com o endpoint (a rota apaga o de
 * outras contas) e o `/api/notify` limpa os que devolvem 410/404.
 */
export async function unsubscribeFromPushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    if (pb.authStore.isValid) {
      await fetch('/api/push/subscription', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch((err) => console.error('Error removing subscription:', err));
    }

    await subscription.unsubscribe();
  } catch (err) {
    console.error('Error unsubscribing from push:', err);
  }
}

async function saveSubscription(subscription: PushSubscription): Promise<boolean> {
  if (!pb.authStore.isValid) return false;
  const { endpoint, keys } = subscription.toJSON();
  const res = await fetch('/api/push/subscription', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ endpoint, keys }),
  });
  return res.ok;
}

// Utility to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
