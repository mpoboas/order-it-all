'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useMemo } from 'react';
import { isSlowConnection } from '@/lib/connection';
import { clearNavDirection } from '@/lib/navTransition';
import { navigateWithTransition } from '@/lib/viewTransition';

/**
 * `router.push`/`replace` dentro de uma View Transition que só termina quando
 * o ecrã novo está pronto (ver `src/lib/viewTransition.ts`), e pelo router
 * simples em ligação lenta.
 *
 * Porquê a exceção: durante a transição o browser mostra um snapshot
 * **congelado** do ecrã antigo. Em 3G a rota nova pode demorar segundos a
 * chegar — sem a transição, a barra de progresso e os skeletons aparecem
 * logo. O slide é um luxo que, em 3G, só atrasa.
 *
 * `back()`/`forward()` continuam no router simples — o `popstate` é animado
 * à parte, por `RouteTransitions`.
 */
export function useSmartRouter() {
  const router = useRouter();

  return useMemo(
    () => ({
      ...router,
      push: (href: string, opts?: Parameters<typeof router.push>[1]) => {
        if (isSlowConnection()) return router.push(href, opts);
        navigateWithTransition(href, () => startTransition(() => router.push(href, opts)), clearNavDirection);
      },
      replace: (href: string, opts?: Parameters<typeof router.replace>[1]) => {
        if (isSlowConnection()) return router.replace(href, opts);
        navigateWithTransition(href, () => startTransition(() => router.replace(href, opts)), clearNavDirection);
      },
    }),
    [router],
  );
}
