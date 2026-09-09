'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Pré-carrega uma rota no primeiro toque/hover (antes do clique disparar a
 * navegação), para o ecrã abrir de imediato em vez de esperar pelo chunk.
 * Devolve handlers para pôr no elemento clicável.
 */
export function usePrefetchOnIntent(href: string | undefined) {
  const router = useRouter();
  const done = useRef<string | null>(null);

  const prefetch = useCallback(() => {
    if (!href || done.current === href) return;
    done.current = href;
    try {
      router.prefetch(href);
    } catch {
      /* noop */
    }
  }, [href, router]);

  return {
    onPointerEnter: prefetch,
    onTouchStart: prefetch,
    onFocus: prefetch,
  };
}

/** Pré-carrega já (no mount) uma lista fixa e pequena de rotas. */
export function usePrefetchRoutes(hrefs: Array<string | undefined>) {
  const router = useRouter();
  const key = hrefs.filter(Boolean).join('|');
  useEffect(() => {
    for (const h of hrefs) {
      if (!h) continue;
      try {
        router.prefetch(h);
      } catch {
        /* noop */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
