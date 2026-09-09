'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransitionRouter } from 'next-view-transitions';
import { useCallback } from 'react';
import { useWebHaptics } from 'web-haptics/react';
import { useTryNavigate } from '@/context/UnsavedDraftContext';
import { parentPath, previousVisit } from '@/lib/navHierarchy';

type NavOpts = { haptic?: boolean };

/**
 * Navegação unificada da app:
 * - **View Transition** (crossfade nativo do browser) via `next-view-transitions`
 *   — o ecrã antigo fica congelado (screenshot) até o novo estar pronto, depois
 *   funde. Sem "flash" de fundo entre páginas. O Header e a BottomNav têm
 *   `view-transition-name` próprio em `globals.css`, por isso não fundem.
 * - **haptic** ao navegar.
 * - **guarda de rascunhos** por gravar (`UnsavedDraftContext`).
 *
 * `back()` = `history.back()` puro (o `<ViewTransitions>` apanha o `popstate`).
 * `up()` = voltar ao **pai na hierarquia** (o comportamento certo para o chevron
 * da top bar): usa `back()` se o histórico já lá está (restaura scroll), senão
 * `push(pai)`.
 */
export function useAppNavigate() {
  const router = useTransitionRouter();
  const plainRouter = useRouter();
  const pathname = usePathname();
  const tryNavigate = useTryNavigate();
  const { trigger } = useWebHaptics();

  const push = useCallback(
    (href: string, opts?: NavOpts) => {
      if (opts?.haptic !== false) trigger();
      tryNavigate(() => router.push(href));
    },
    [router, tryNavigate, trigger],
  );

  const replace = useCallback(
    (href: string, opts?: NavOpts) => {
      if (opts?.haptic !== false) trigger();
      tryNavigate(() => router.replace(href));
    },
    [router, tryNavigate, trigger],
  );

  const back = useCallback(
    (opts?: NavOpts) => {
      if (opts?.haptic !== false) trigger();
      tryNavigate(() => plainRouter.back());
    },
    [plainRouter, tryNavigate, trigger],
  );

  const up = useCallback(
    (opts?: NavOpts) => {
      if (opts?.haptic !== false) trigger();
      const parent = parentPath(pathname);
      tryNavigate(() => {
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
