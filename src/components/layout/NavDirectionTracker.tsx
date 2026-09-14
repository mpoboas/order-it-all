'use client';

import { useEffect } from 'react';
import { markNavDirection } from '@/lib/navTransition';

/**
 * Marca a transição como "back" em qualquer `popstate` real (botão físico ou
 * gesto de recuar do Android, botão de recuar do browser) — casos que não
 * passam por `useAppNavigate.back()/up()` e por isso não marcam a direção
 * sozinhos. Tem de estar montado como filho direto de `<ViewTransitions>`
 * (`src/app/layout.tsx`): os efeitos de componentes filhos correm antes do
 * efeito do próprio pai no mount, por isso este `addEventListener('popstate')`
 * fica registado no `window` antes do listener interno da
 * `next-view-transitions` (que dispara `document.startViewTransition`) —
 * corre primeiro em qualquer `popstate`, a tempo de a View Transition ler o
 * atributo já marcado. Redundante (inofensivo) quando `back()`/`up()` já
 * marcaram a direção — só é a única fonte de verdade no caso "externo".
 */
export function NavDirectionTracker() {
  useEffect(() => {
    const onPopState = () => markNavDirection('back');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  return null;
}
