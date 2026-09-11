'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useWebHaptics } from 'web-haptics/react';
import { useTryNavigate } from '@/context/UnsavedDraftContext';
import { parentPath, previousVisit } from '@/lib/navHierarchy';
import { navStart } from '@/lib/navProgress';
import { useSmartRouter } from '@/hooks/useSmartRouter';

type NavOpts = { haptic?: boolean };

/** Mesma rota que a atual? (ignora query/hash e barra final) — nesse caso a
 *  navegação é um no-op e não deve acender a barra de progresso (que ficaria
 *  presa: sem mudança de `pathname`, o `navDone` nunca dispara). */
function isSamePath(href: string, current: string): boolean {
  const dest = href.split(/[?#]/)[0].replace(/(.)\/$/, '$1');
  return dest === current.replace(/(.)\/$/, '$1');
}

/**
 * Navegação unificada da app:
 * - **View Transition** (crossfade nativo do browser) via `next-view-transitions`
 *   — o ecrã antigo fica congelado (screenshot) até o novo estar pronto, depois
 *   funde. Sem "flash" de fundo entre páginas. O Header e a BottomNav têm
 *   `view-transition-name` próprio em `globals.css`, por isso não fundem.
 *   **Exceção:** em ligação lenta (`isSlowConnection`) navegamos sem transição —
 *   o `next-view-transitions` segura o screenshot antigo até a rota nova montar,
 *   e em 3G isso são segundos de ecrã congelado sem barra nem skeleton. Sem
 *   transição, o `loading.tsx` e a barra de topo aparecem assim que puderem.
 * - **haptic** ao navegar.
 * - **guarda de rascunhos** por gravar (`UnsavedDraftContext`).
 *
 * `back()` = `history.back()` puro (o `<ViewTransitions>` apanha o `popstate`).
 * `up()` = voltar ao **pai na hierarquia** (o comportamento certo para o chevron
 * da top bar): usa `back()` se o histórico já lá está (restaura scroll), senão
 * `push(pai)`.
 */
export function useAppNavigate() {
  const router = useSmartRouter();
  const plainRouter = useRouter();
  const pathname = usePathname();
  const tryNavigate = useTryNavigate();
  const { trigger } = useWebHaptics();

  const push = useCallback(
    (href: string, opts?: NavOpts) => {
      if (isSamePath(href, pathname)) return;
      if (opts?.haptic !== false) trigger();
      tryNavigate(() => {
        navStart();
        router.push(href);
      });
    },
    [router, tryNavigate, trigger, pathname],
  );

  const replace = useCallback(
    (href: string, opts?: NavOpts) => {
      if (isSamePath(href, pathname)) return;
      if (opts?.haptic !== false) trigger();
      tryNavigate(() => {
        navStart();
        router.replace(href);
      });
    },
    [router, tryNavigate, trigger, pathname],
  );

  const back = useCallback(
    (opts?: NavOpts) => {
      if (opts?.haptic !== false) trigger();
      tryNavigate(() => {
        navStart();
        plainRouter.back();
      });
    },
    [plainRouter, tryNavigate, trigger],
  );

  const up = useCallback(
    (opts?: NavOpts) => {
      if (opts?.haptic !== false) trigger();
      const parent = parentPath(pathname);
      tryNavigate(() => {
        navStart();
        if (!parent) {
          plainRouter.back();
        } else if (previousVisit() === parent) {
          // O histórico já bate certo — `back()` volta ao pai e restaura o scroll.
          plainRouter.back();
        } else {
          router.push(parent);
        }
      });
    },
    [pathname, router, plainRouter, tryNavigate, trigger],
  );

  return { push, replace, back, up };
}
