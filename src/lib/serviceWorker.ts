'use client';

/**
 * URL único do service worker. Em produção leva `?cache=1` (liga a casca
 * offline só de leitura, ver `public/sw.js`) e `&build=<id>` — cada deploy é um
 * SW novo, que pré-guarda os estáticos desse build. Em `next dev` é o mesmo ficheiro
 * sem esse parâmetro — só push, sem interceptar pedidos (nada de cache no
 * meio do HMR). Quem registar o SW (casca ou notificações) tem de usar este
 * URL: registar outro script no mesmo scope substituiria o SW ativo.
 */
export const SW_URL =
  process.env.NODE_ENV === 'production'
    ? `/sw.js?cache=1&build=${encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID || 'unknown')}`
    : '/sw.js';

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  try {
    return await navigator.serviceWorker.register(SW_URL);
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return undefined;
  }
}
