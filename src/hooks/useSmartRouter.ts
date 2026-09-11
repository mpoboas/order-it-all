'use client';

import { useRouter } from 'next/navigation';
import { useTransitionRouter } from 'next-view-transitions';
import { useMemo } from 'react';
import { isSlowConnection } from '@/lib/connection';

/**
 * `router.push`/`replace` que passa pelo View Transitions em ligação normal e
 * pelo router simples em ligação lenta.
 *
 * Porquê: o `next-view-transitions` embrulha cada navegação num
 * `document.startViewTransition` cujo callback só resolve quando a rota nova
 * monta — até lá o browser mostra um screenshot **congelado** do ecrã antigo.
 * Em 3G isso são segundos sem barra de progresso nem `loading.tsx` (renderizam
 * no DOM vivo, escondido por baixo do screenshot). Sem a transição, o feedback
 * aparece assim que a rede deixa. O crossfade é um luxo que, em 3G, só atrasa.
 *
 * `back()`/`forward()` continuam no router simples (o `popstate` é apanhado pelo
 * `<ViewTransitions>` à parte).
 */
export function useSmartRouter() {
  const transitionRouter = useTransitionRouter();
  const plainRouter = useRouter();

  return useMemo(
    () => ({
      ...plainRouter,
      push: (href: string, opts?: Parameters<typeof plainRouter.push>[1]) =>
        (isSlowConnection() ? plainRouter : transitionRouter).push(href, opts),
      replace: (href: string, opts?: Parameters<typeof plainRouter.replace>[1]) =>
        (isSlowConnection() ? plainRouter : transitionRouter).replace(href, opts),
    }),
    [transitionRouter, plainRouter],
  );
}
