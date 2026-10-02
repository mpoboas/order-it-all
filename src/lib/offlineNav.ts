'use client';

/**
 * Navegação sem rede (Fase 13 · Parte B). A navegação no cliente precisa do
 * payload RSC do servidor — sem rede falharia (e o ecrã ficava parado sem
 * aviso). Em vez disso:
 *  - ecrã já guardado pelo service worker → carregamento completo, servido da
 *    cache (mostra os dados que já estão no Dexie, só leitura);
 *  - ecrã nunca aberto neste dispositivo → não navega (quem chama avisa).
 */
export async function navigateWhileOffline(href: string, mode: 'push' | 'replace' = 'push'): Promise<boolean> {
  const url = new URL(href, window.location.origin);
  let cached: Response | undefined;
  try {
    cached = typeof caches !== 'undefined' ? await caches.match(url.origin + url.pathname) : undefined;
  } catch {
    cached = undefined;
  }
  if (!cached) return false;
  if (mode === 'replace') window.location.replace(url.href);
  else window.location.assign(url.href);
  return true;
}

export const OFFLINE_NAV_BLOCKED_MESSAGE =
  'Sem ligação. Este ecrã ainda não foi aberto neste dispositivo, por isso não há cópia guardada.';
