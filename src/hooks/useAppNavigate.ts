'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useWebHaptics } from 'web-haptics/react';
import { useTryNavigate } from '@/context/UnsavedDraftContext';
import { parentPath, previousVisit } from '@/lib/navHierarchy';
import { navStart } from '@/lib/navProgress';
import { useSmartRouter } from '@/hooks/useSmartRouter';
import { markNavDirection } from '@/lib/navTransition';
import { isAppOffline } from '@/lib/connectivity';
import { navigateWhileOffline, OFFLINE_NAV_BLOCKED_MESSAGE } from '@/lib/offlineNav';
import { useToast } from '@/context/ToastContext';

type NavOpts = {
  haptic?: boolean;
  /** 'none' para navegação lateral entre irmãos (trocar de tab) — sem isto,
   *  `push`/`replace` marcam sempre a transição como "forward" (entrar num
   *  ecrã, desliza da direita). Ver `src/lib/navTransition.ts`. */
  transition?: 'auto' | 'none';
};

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
 *
 * **Direção da animação (Fase 9)** — `push`/`replace` marcam a transição como
 * "forward" (novo ecrã entra da direita) via `markNavDirection`, `back`/`up`
 * marcam "back" (ecrã atual sai para a direita, o anterior entra da esquerda)
 * — ver `src/lib/navTransition.ts` e as regras em `globals.css`. Passar
 * `{ transition: 'none' }` para navegação lateral entre irmãos (trocar de
 * tab) — sem direção marcada, fica o crossfade de sempre.
 */
export function useAppNavigate() {
  const router = useSmartRouter();
  const plainRouter = useRouter();
  const pathname = usePathname();
  const tryNavigate = useTryNavigate();
  const { trigger } = useWebHaptics();
  const { showToast } = useToast();

  // Sem rede: usa a cópia do ecrã guardada pelo service worker (só leitura) ou
  // bloqueia com aviso — nunca deixa a navegação falhar em silêncio.
  const goOffline = useCallback(
    (href: string, mode: 'push' | 'replace') => {
      void navigateWhileOffline(href, mode).then((ok) => {
        if (!ok) showToast(OFFLINE_NAV_BLOCKED_MESSAGE, 'error');
      });
    },
    [showToast],
  );

  const push = useCallback(
    (href: string, opts?: NavOpts) => {
      if (isSamePath(href, pathname)) return;
      if (opts?.haptic !== false) trigger();
      tryNavigate(() => {
        if (isAppOffline()) return goOffline(href, 'push');
        navStart();
        if (opts?.transition !== 'none') markNavDirection('forward');
        router.push(href);
      });
    },
    [router, tryNavigate, trigger, pathname, goOffline],
  );

  const replace = useCallback(
    (href: string, opts?: NavOpts) => {
      if (isSamePath(href, pathname)) return;
      if (opts?.haptic !== false) trigger();
      tryNavigate(() => {
        if (isAppOffline()) return goOffline(href, 'replace');
        navStart();
        if (opts?.transition !== 'none') markNavDirection('forward');
        router.replace(href);
      });
    },
    [router, tryNavigate, trigger, pathname, goOffline],
  );

  const back = useCallback(
    (opts?: NavOpts) => {
      if (opts?.haptic !== false) trigger();
      tryNavigate(() => {
        navStart();
        markNavDirection('back');
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
        // "Subir" é sempre semanticamente um "voltar", mesmo quando por baixo
        // é implementado com `push(pai)` (histórico não alinhado) — a direção
        // da animação segue a intenção, não o mecanismo.
        markNavDirection('back');
        if (!parent) {
          plainRouter.back();
        } else if (previousVisit() === parent) {
          // O histórico já bate certo — `back()` volta ao pai e restaura o scroll.
          plainRouter.back();
        } else if (isAppOffline()) {
          goOffline(parent, 'push');
        } else {
          router.push(parent);
        }
      });
    },
    [pathname, router, plainRouter, tryNavigate, trigger, goOffline],
  );

  return { push, replace, back, up };
}
