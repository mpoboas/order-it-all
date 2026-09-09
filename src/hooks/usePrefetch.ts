'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

/** Rotas já pré-carregadas — evita repetir a cada re-mount. Esvazia-se a cada
 *  4 min (< `staleTimes.static`) para o cache voltar a aquecer. */
const prefetched = new Set<string>();
if (typeof window !== 'undefined') {
  setInterval(() => prefetched.clear(), 4 * 60 * 1000);
}

/**
 * `router.prefetch(href, { kind: 'full' })` — prefetch **completo** do payload
 * RSC da página (não só o "shell"/`loading.tsx`). Assim a navegação para uma
 * rota já pré-carregada é servida do Router Cache sem ida à rede.
 * `PrefetchKind.FULL === 'full'` (string enum) — passamos a string.
 */
function fullPrefetch(
  router: ReturnType<typeof useRouter>,
  href: string,
): void {
  if (prefetched.has(href)) return;
  prefetched.add(href);
  try {
    (router.prefetch as (h: string, o: { kind: 'full' }) => void)(href, {
      kind: 'full',
    });
  } catch {
    /* noop */
  }
}

/**
 * Pré-carrega uma rota no primeiro toque/hover/focus (antes do clique disparar a
 * navegação). Devolve handlers para pôr no elemento clicável.
 */
export function usePrefetchOnIntent(href: string | undefined) {
  const router = useRouter();
  const done = useRef<string | null>(null);

  const prefetch = useCallback(() => {
    if (!href || done.current === href) return;
    done.current = href;
    fullPrefetch(router, href);
  }, [href, router]);

  return {
    onPointerEnter: prefetch,
    onTouchStart: prefetch,
    onFocus: prefetch,
  };
}

/**
 * Pré-carrega uma lista de rotas assim que forem conhecidas. `cap` limita
 * quantas (evita 50 prefetches numa lista grande).
 */
export function usePrefetchRoutes(hrefs: Array<string | undefined>, cap = 12) {
  const router = useRouter();
  const targets = hrefs.filter((h): h is string => !!h).slice(0, cap);
  const key = targets.join('|');
  useEffect(() => {
    for (const h of targets) fullPrefetch(router, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
