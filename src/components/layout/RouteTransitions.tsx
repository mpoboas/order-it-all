'use client';

import { use, useEffect, useLayoutEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { clearNavDirection, markNavDirection } from '@/lib/navTransition';
import {
  isNativeSwipeNavigation,
  isPendingPath,
  setCommittedPath,
  supportsViewTransitions,
  trackEdgeSwipes,
  waitForRouteSettled,
} from '@/lib/viewTransition';

type StartViewTransition = (update: () => Promise<void>) => { finished: Promise<void> };

/**
 * Substitui o `<ViewTransitions>` do `next-view-transitions` (Fase 15) — ver
 * `src/lib/viewTransition.ts`. Duas coisas:
 *
 * 1. Informa o controlador de qual rota o React já montou (`setCommittedPath`).
 * 2. Anima os `popstate` (voltar do browser/Android, `history.back()` do
 *    chevron): a transição só termina quando o ecrã novo está pronto, e é
 *    saltada quando o `popstate` vem do gesto nativo de voltar do iOS.
 *
 * Como no original, o render da rota nova fica suspenso (`use`) até o browser
 * ter tirado o snapshot do ecrã antigo — senão o React podia montar a rota
 * nova antes, e o "snapshot antigo" já seria o ecrã novo.
 */
export function RouteTransitions({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [captured, setCaptured] = useState<Promise<void> | null>(null);

  useEffect(() => trackEdgeSwipes(), []);

  useEffect(() => {
    if (!supportsViewTransitions()) return;
    const onPopState = () => {
      if (isNativeSwipeNavigation()) {
        clearNavDirection();
        return;
      }
      markNavDirection('back');
      const start = (document as Document & { startViewTransition: StartViewTransition }).startViewTransition.bind(document);
      let onCaptured!: () => void;
      const capturedPromise = new Promise<void>((resolve) => {
        onCaptured = resolve;
      });
      const transition = start(async () => {
        onCaptured();
        await waitForRouteSettled();
      });
      transition.finished.finally(() => {
        clearNavDirection();
        setCaptured(null);
      });
      setCaptured(capturedPromise);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Rota nova a caminho e snapshot antigo ainda por tirar: suspende (o ecrã
  // antigo fica visível) até o browser o ter tirado.
  if (captured && isPendingPath(pathname)) use(captured);

  useLayoutEffect(() => {
    setCommittedPath(pathname);
  }, [pathname]);

  return <>{children}</>;
}
