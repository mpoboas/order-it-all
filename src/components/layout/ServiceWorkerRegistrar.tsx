'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isAppOffline } from '@/lib/connectivity';
import { isSlowConnection } from '@/lib/connection';
import { registerAppServiceWorker } from '@/lib/serviceWorker';
import { manageServiceWorkerUpdates } from '@/lib/swUpdate';
// Importado aqui (montado em TODAS as páginas) só pelo efeito lateral: regista
// o listener de `beforeinstallprompt` logo no arranque. O Chrome dispara esse
// evento UMA vez, cedo — antes só se ouvia quando o onboarding ou o pedido de
// notificações estavam carregados, e o evento perdia-se (sem botão "Instalar").
import '@/lib/installPrompt';

/**
 * Regista o service worker da casca offline — SÓ em builds de produção (em
 * `next dev` não há cache no meio do HMR; as notificações continuam a
 * registar o SW só-push via `registerAppServiceWorker`). A troca de versão é
 * silenciosa: aplica-se ao arrancar ou com a app em segundo plano, nunca a
 * meio do uso (ver `src/lib/swUpdate.ts`).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      // `next dev` num domínio onde antes correu um build de produção: a casca
      // offline desse build (SW `?cache=1`) ainda controlava a página e servia
      // HTML/JS velho da cache — a app de dev nunca chegava a correr a sério.
      // Regista o SW só-push (assume logo e apaga essas caches) e recarrega
      // uma vez quando ele tomar conta.
      const staleShell = navigator.serviceWorker.controller?.scriptURL.includes('cache=1');
      if (staleShell) {
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
      }
      void registerAppServiceWorker();
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    void registerAppServiceWorker().then((registration) => {
      if (registration && !cancelled) stop = manageServiceWorkerUpdates(registration);
    });
    // Proteger a cache e o Dexie da limpeza automática do browser (iOS apaga
    // dados de sites pouco usados). Best-effort — o browser pode recusar.
    void navigator.storage?.persist?.().catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
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
