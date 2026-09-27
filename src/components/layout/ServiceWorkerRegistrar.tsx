'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isAppOffline } from '@/lib/connectivity';
import { isSlowConnection } from '@/lib/connection';
import { registerAppServiceWorker } from '@/lib/serviceWorker';
// Importado aqui (montado em TODAS as páginas) só pelo efeito lateral: regista
// o listener de `beforeinstallprompt` logo no arranque. O Chrome dispara esse
// evento UMA vez, cedo — antes só se ouvia quando o onboarding ou o pedido de
// notificações estavam carregados, e o evento perdia-se (sem botão "Instalar").
import '@/lib/installPrompt';

/**
 * Regista o service worker da casca offline — SÓ em builds de produção (em
 * `next dev` não há cache no meio do HMR; as notificações continuam a
 * registar o SW só-push via `registerAppServiceWorker`). A troca de versão é
 * silenciosa e standard: o SW novo instala e fica em `waiting` sem interromper
 * a sessão; só assume o controlo quando o browser fecha e reabre o site sem
 * nenhuma tab a usar a versão antiga (sem `skipWaiting`/toast a meio do uso).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    void registerAppServiceWorker();
    // Proteger a cache e o Dexie da limpeza automática do browser (iOS apaga
    // dados de sites pouco usados). Best-effort — o browser pode recusar.
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  // Guarda o HTML do ecrã em que se acabou de entrar (a navegação no cliente
  // não o pede) — só com rede boa, para não gastar 3G com isto.
  const pathname = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    if (isAppOffline() || isSlowConnection()) return;
    const id = setTimeout(() => {
      navigator.serviceWorker.controller?.postMessage({ type: 'CACHE_PAGE', url: window.location.href });
    }, 1500);
    return () => clearTimeout(id);
  }, [pathname]);

  return null;
}
